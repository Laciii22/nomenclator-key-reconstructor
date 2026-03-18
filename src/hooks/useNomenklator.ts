import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { KeysPerPTMode, PTChar, SelectionMap, DragData } from '../types/domain';
import { useLocalSettings, STORAGE_KEY } from './useLocalSettings';
import { resolveMergeFromEvent } from '../utils/dnd';
import { buildCandidateOptions } from '../components/controls/candidateHelpers';
import { buildOccMap } from '../utils/parseStrategies';
import type { DragEndEvent } from '@dnd-kit/core';
import { normalizeToArray, getReservedTokens } from '../utils/multiKeyHelpers';
import { useParsing } from './useParsing';
import { useMapping } from './useMapping';
import { useAnalysis } from './useAnalysis';
import { useNomenklatorPersistence } from './useNomenklatorPersistence';
import { useNomenklatorStatus } from './useNomenklatorStatus';
import { useAutoPickScoreOneSequential } from './useAutoPickScoreOneSequential';
import { useDebouncedCallback } from './useDebouncedCallback';
import { useViewportWidth } from './useViewportWidth';
import { buildEffectiveToOriginalIndexMap } from './nomenclator/ctIndexMaps';
import { tokenIndexIsLockedInColumns } from './nomenclator/dndRules';
import {
  countMergeableOccurrences as countMergeableOccurrencesHelper,
  mergeAllOccurrences as mergeAllOccurrencesHelper,
  splitPtGroupAt,
  tryJoinAdjacentPtGroups,
} from './nomenclator/ptGrouping';
import { computeInsertRawCharsAfterPosition } from './nomenclator/insertRawAfterPosition';
import { normalizeLocks } from '../utils/frequency';

/**
 * Responsive breakpoints for PT grid layout.
 * Based on Tailwind breakpoints: sm=640, md=768, lg=1024, xl=1280, 2xl=1536
 */
const RESPONSIVE_BREAKPOINTS = [
  { maxWidth: 640, columns: 10 },
  { maxWidth: 768, columns: 12 },
  { maxWidth: 1024, columns: 16 },
  { maxWidth: 1280, columns: 18 },
  { maxWidth: Infinity, columns: 24 },
] as const;

/**
 * Central state/logic hook for the Nomenclator UI.
 *
 * This hook intentionally aggregates multiple domain-specific concerns (parsing, mapping,
 * analysis, persistence) so the page component can stay mostly declarative.
 *
 * The return value is grouped into `{ inputs, state, derived, actions }` and memoized.
 * That grouping is primarily a render-performance and ergonomics choice: it makes it
 * easier for the page to destructure only what it uses, and helps keep prop references
 * stable when passing handlers into large table components.
 */
export function useNomenklator() {
  const [settings, setSettings] = useLocalSettings({ keysPerPTMode: 'single' });
  const hydrated = useRef(false);

  // Inputs & modes
  const [ptRaw, setPtRaw] = useState('');
  const [keysPerPTMode, setKeysPerPTMode] = useState<KeysPerPTMode>('single');

  // Store state snapshot from before Run Analysis was clicked
  const preAnalysisStateRef = useRef<{
    ptRaw: string;
    ctRawSeparator: string;
    ctRawFixed: string;
    ctParseMode: 'separator' | 'fixedLength';
    separator: string;
    fixedLength: number;
    keysPerPTMode: KeysPerPTMode;
    customPtGroups: PTChar[] | null;
    bracketedIndices: number[];
  } | null>(null);

  // Locks & selections
  const [lockedKeys, setLockedKeys] = useState<Record<string, string | string[]>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [pendingAutoRefresh, setPendingAutoRefresh] = useState(false);
  const isDraggingRef = useRef(false);

  // Status / warnings
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // Highlighting: single PT character to visually emphasize across the grid
  const [highlightedPTChar, setHighlightedPTChar] = useState<string | null>(null);

  const toggleHighlightForOT = useCallback((ch: string) => {
    setHighlightedPTChar(prev => prev === ch ? null : ch);
  }, []);

  // Derived sets
  const reservedTokens = useMemo(() => {
    if (keysPerPTMode === 'multiple') {
      // In multi-key mode, tokens can be used by multiple PT characters (homophones)
      // So we don't mark them as reserved
      return new Set<string>();
    }
    // Single-key mode: use helper to gather all reserved tokens
    return getReservedTokens(lockedKeys, selections);
  }, [lockedKeys, selections, keysPerPTMode]);

  // Optional custom grouping of PT characters (supports merging adjacent PT cells)
  const [customPtGroups, setCustomPtGroups] = useState<PTChar[] | null>(null);
  const [mergeAllPrompt, setMergeAllPrompt] = useState<{ pattern: string; remaining: number } | null>(null);

  const ptChars = useMemo(() => {
    if (customPtGroups && customPtGroups.length) return customPtGroups;
    // Bracket syntax: [WORD] is a single multi-char token, bare chars are single tokens.
    const stripped = ptRaw.replace(/\s/g, '');
    const tokens: string[] = [];
    let i = 0;
    while (i < stripped.length) {
      if (stripped[i] === '[') {
        const end = stripped.indexOf(']', i + 1);
        if (end === -1) {
          // unclosed bracket — treat remaining chars individually
          for (let j = i + 1; j < stripped.length; j++) tokens.push(stripped[j]);
          break;
        }
        const word = stripped.slice(i + 1, end);
        if (word) tokens.push(word);
        i = end + 1;
      } else {
        tokens.push(stripped[i]);
        i++;
      }
    }
    return tokens.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [ptRaw, customPtGroups]);

  const getFlatPTGroups = useCallback((): PTChar[] => {
    return (customPtGroups && customPtGroups.length)
      ? customPtGroups
      : ptChars.filter(c => c.ch !== '');
  }, [customPtGroups, ptChars]);

  const countMergeableOccurrences = useCallback((groups: PTChar[], pattern: string) => {
    // Normalize to single-key format for this helper
    const normalizedLocks = normalizeLocks(lockedKeys);
    return countMergeableOccurrencesHelper(groups, pattern, normalizedLocks);
  }, [lockedKeys]);

  const mergeAllOccurrences = useCallback((pattern: string) => {
    const flat = getFlatPTGroups();
    // Normalize to single-key format for this helper
    const normalizedLocks = normalizeLocks(lockedKeys);
    const res = mergeAllOccurrencesHelper(flat, pattern, normalizedLocks);
    if (!res) return;
    setCustomPtGroups(res.nextGroups);
    setMergeAllPrompt(res.remaining > 0 ? { pattern: res.target, remaining: res.remaining } : null);
  }, [getFlatPTGroups, lockedKeys]);

  const dismissMergeAllPrompt = useCallback(() => {
    setMergeAllPrompt(null);
  }, []);

  const parsing = useParsing({ ptCount: ptChars.length });
  const {
    ctParseMode,
    setCtParseMode,
    ctRaw,
    setCtRaw,
    setCtRawForMode,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    groupSize,
    ctTokens,
    effectiveCtTokens,
    bracketedIndices,
    setBracketedIndices,
    toggleBracketGroupByText: toggleBracketGroupByTextParse,
    uniqueCTTokenTexts: uniqueCTTokenTextsParse,
    klamacStatus: klamacStatusFromParse,
    statusMessage: statusMessageFromParse,
    bracketWarning: bracketWarningFromParse,
    setCtRawSeparator,
    setCtRawFixed,
  } = parsing;

  /**
   * Quick assign: manually assign PT pattern to CT token.
   * 1. Validates that PT pattern exists in the text
   * 2. Checks frequency match (returns warning if not 1:1)
   * 
   * @returns { error?: string, warning?: { ptCount: number, ctCount: number } }
   */
  const quickAssign = useCallback((ptPattern: string, ctToken: string): { error?: string; warning?: { ptCount: number; ctCount: number } } | null => {
    const pattern = ptPattern.trim().toUpperCase();
    const token = ctToken.trim();

    // Validation
    if (!pattern) return { error: 'PT pattern cannot be empty' };
    if (!token) return { error: 'CT token cannot be empty' };

    // Check if pattern exists in PT text
    const ptText = ptRaw.replace(/\s/g, '');
    if (!ptText.includes(pattern)) {
      return { error: `Pattern "${pattern}" not found in PT text` };
    }

    // Count occurrences in PT
    const ptCount = (() => {
      let count = 0;
      let pos = 0;
      while (pos < ptText.length) {
        const idx = ptText.indexOf(pattern, pos);
        if (idx === -1) break;
        count++;
        pos = idx + 1; // Allow overlapping matches
      }
      return count;
    })();

    // Count occurrences in CT
    let ctCount = 0;
    if (ctParseMode === 'fixedLength') {
      // In fixed-length mode, count logical groups (final group may be shorter)
      const size = Math.max(1, fixedLength || 1);
      for (let i = 0; i < effectiveCtTokens.length; i += size) {
        const groupText = effectiveCtTokens.slice(i, i + size).map(t => t.text).join('');
        if (groupText === token) ctCount++;
      }
    } else {
      // In separator mode, count individual tokens
      ctCount = ctTokens.filter(t => t.text === token).length;
    }

    // Check frequency match
    const frequencyWarning = ptCount !== ctCount ? { ptCount, ctCount } : undefined;

    return frequencyWarning ? { warning: frequencyWarning } : null;
  }, [ptRaw, ctTokens, ctParseMode, fixedLength, effectiveCtTokens]);

  /**
   * Execute quick assign after user confirmation.
   * Called after frequency check passes or user confirms the warning.
   */
  const executeQuickAssign = useCallback((ptPattern: string, ctToken: string): string | null => {
    const pattern = ptPattern.trim().toUpperCase();
    const token = ctToken.trim();

    // Merge all occurrences first
    const flat = getFlatPTGroups();
    const normalizedLocks = normalizeLocks(lockedKeys);

    const mergeResult = mergeAllOccurrencesHelper(flat, pattern, normalizedLocks);
    if (!mergeResult) {
      return `Failed to merge pattern "${pattern}"`;
    }

    // Update groups
    setCustomPtGroups(mergeResult.nextGroups);
    setMergeAllPrompt(mergeResult.remaining > 0 ? { pattern: mergeResult.target, remaining: mergeResult.remaining } : null);

    // Set selection (not locked) for the pattern
    setSelections(prev => {
      const next = { ...prev };
      if (keysPerPTMode === 'multiple') {
        // In multiple mode, add to array if not already present
        const existing = Array.isArray(prev[pattern]) ? prev[pattern] as string[] : [];
        if (!existing.includes(token)) {
          next[pattern] = [...existing, token];
        }
      } else {
        // In single mode, just set the token
        next[pattern] = token;
      }
      return next;
    });

    // React 18 batches all setState calls within event handlers, so a direct
    // call is sufficient — no microtask indirection needed.
    setPendingAutoRefresh(true);

    return null; // Success
  }, [getFlatPTGroups, lockedKeys, keysPerPTMode, setCustomPtGroups, setMergeAllPrompt, setSelections, setPendingAutoRefresh]);

  // Responsive PT grid width.
  // This intentionally affects only layout (row wrapping), not mapping/analysis rules.
  // Debounced resize listener is encapsulated in useViewportWidth.
  const viewportWidth = useViewportWidth(150);

  const OT_COLUMNS_PER_ROW = useMemo(() => {
    for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
      if (viewportWidth < breakpoint.maxWidth) {
        return breakpoint.columns;
      }
    }
    return RESPONSIVE_BREAKPOINTS[RESPONSIVE_BREAKPOINTS.length - 1].columns;
  }, [viewportWidth]);
  const ptRows = useMemo(() => {
    const rows: { id: string; ch: string }[][] = [];
    for (let i = 0; i < ptChars.length; i += OT_COLUMNS_PER_ROW) rows.push(ptChars.slice(i, i + OT_COLUMNS_PER_ROW));
    return rows.length ? rows : [[]];
  }, [ptChars, OT_COLUMNS_PER_ROW]);

  const mapping = useMapping({
    ptRows,
    effectiveCtTokens,
    lockedKeys,
    selections,
    ctParseMode,
    groupSize,
    keysPerPTMode,
  });

  const { columns, manualPtCounts, shiftMeta } = mapping;

  const analysis = useAnalysis({
    ptRows,
    ctParseMode,
    fixedLength,
    effectiveCtTokens,
    columns,
    keysPerPTMode,
    lockedKeys,
    setSelections,
  });

  const { candidatesByChar, analysisDone, isAnalyzing, runAnalysis: runAnalysisCore, refreshAnalysisPreserve } = analysis;

  const effToOrig = useMemo(() => {
    return buildEffectiveToOriginalIndexMap(ctTokens.length, bracketedIndices);
  }, [ctTokens.length, bracketedIndices]);

  // Fixed-length: build unique CT groups ordered by original CT index.
  // Includes current shifted groups and bracketed runs; computes `allBracketed`.
  const uniqueCTTokenTexts = useMemo(() => {
    if (ctParseMode !== 'fixedLength') return uniqueCTTokenTextsParse;
    const size = Math.max(1, fixedLength || 1);
    if (size <= 1) return uniqueCTTokenTextsParse;
    if (!analysisDone) return uniqueCTTokenTextsParse;

    // Collect all groups — both non-bracketed (from columns) and bracketed (from
    // bracketedIndices runs) — tagged with their first original-token index so we
    // can sort them into a stable position-based order.
    const entries: { startIdx: number; text: string; isBracketed: boolean }[] = [];

    // 1) Non-bracketed groups from the current shifted mapping table.
    for (let r = 0; r < columns.length; r++) {
      for (let c = 0; c < columns[r].length; c++) {
        const col = columns[r][c];
        if (!col.ct || col.ct.length === 0) continue;
        let text = '';
        let minOrig = Infinity;
        for (const effIdx of col.ct) {
          text += (effectiveCtTokens[effIdx]?.text ?? '');
          const orig = effToOrig[effIdx];
          if (typeof orig === 'number' && orig >= 0 && orig < minOrig) minOrig = orig;
        }
        if (!text || minOrig === Infinity) continue;
        entries.push({ startIdx: minOrig, text, isBracketed: false });
      }
    }

    // 2) Bracketed runs — scan ctTokens for contiguous bracketed-index spans.
    //    Split each run into fixed-size chunks so adjacent bracketed groups
    //    like "99" + "9" are shown as separate entries, not as "999".
    if (bracketedIndices.length) {
      const br = new Set(bracketedIndices);
      let i = 0;
      while (i < ctTokens.length) {
        if (!br.has(i)) { i++; continue; }
        const runIndices: number[] = [];
        while (i < ctTokens.length && br.has(i)) {
          runIndices.push(i);
          i++;
        }
        for (let start = 0; start < runIndices.length; start += size) {
          const chunk = runIndices.slice(start, start + size);
          const text = chunk.map(idx => ctTokens[idx]?.text ?? '').join('');
          if (!text) continue;
          entries.push({ startIdx: chunk[0], text, isBracketed: true });
        }
      }
    }

    // Sort all entries by their original start index to get a stable order.
    entries.sort((a, b) => a.startIdx - b.startIdx);

    // De-duplicate by text: first occurrence sets the order; allBracketed is true
    // only when every group with that text is bracketed.
    const textMeta = new Map<string, { allBracketed: boolean }>();
    const order: string[] = [];
    for (const { text, isBracketed } of entries) {
      const prev = textMeta.get(text);
      if (!prev) {
        textMeta.set(text, { allBracketed: isBracketed });
        order.push(text);
      } else {
        prev.allBracketed = prev.allBracketed && isBracketed;
      }
    }

    return order.map(text => ({ text, allBracketed: textMeta.get(text)!.allBracketed }));
  }, [analysisDone, bracketedIndices, columns, effectiveCtTokens, effToOrig, fixedLength, uniqueCTTokenTextsParse, ctParseMode, ctTokens]);

  const toggleBracketGroupByText = useCallback((text: string) => {
    if (!text) return;

    if (ctParseMode !== 'fixedLength') {
      toggleBracketGroupByTextParse(text);
      return;
    }

    const size = Math.max(1, fixedLength || 1);
    if (size <= 1 || !analysisDone) {
      toggleBracketGroupByTextParse(text);
      return;
    }

    const indicesToToggle: number[] = [];

    for (let r = 0; r < columns.length; r++) {
      for (let c = 0; c < columns[r].length; c++) {
        const col = columns[r][c];
        if (!col.ct || col.ct.length === 0) continue;
        let groupText = '';
        for (const effIdx of col.ct) groupText += (effectiveCtTokens[effIdx]?.text ?? '');
        if (groupText !== text) continue;
        for (const effIdx of col.ct) {
          const orig = effToOrig[effIdx];
          if (typeof orig === 'number' && orig >= 0) indicesToToggle.push(orig);
        }
      }
    }

    // If the group doesn't exist in the current shifted grid (e.g. it's already
    // fully bracketed and thus filtered out of `effectiveCtTokens`), fall back
    // to currently bracketed runs chunked by fixed length.
    if (!indicesToToggle.length) {
      if (bracketedIndices.length) {
        const br = new Set(bracketedIndices);
        let i = 0;
        while (i < ctTokens.length) {
          if (!br.has(i)) {
            i++;
            continue;
          }
          const runIndices: number[] = [];
          while (i < ctTokens.length && br.has(i)) {
            runIndices.push(i);
            i++;
          }
          for (let start = 0; start < runIndices.length; start += size) {
            const chunk = runIndices.slice(start, start + size);
            const chunkText = chunk.map(idx => ctTokens[idx]?.text ?? '').join('');
            if (chunkText === text) indicesToToggle.push(...chunk);
          }
        }
      }

      if (!indicesToToggle.length) {
        toggleBracketGroupByTextParse(text);
        return;
      }
    }

    setBracketedIndices(prev => {
      const set = new Set(prev);
      const unique = Array.from(new Set(indicesToToggle)).sort((a, b) => a - b);
      const all = unique.every(i => set.has(i));
      if (all) unique.forEach(i => set.delete(i));
      else unique.forEach(i => set.add(i));
      return Array.from(set).sort((a, b) => a - b);
    });
  }, [analysisDone, columns, effToOrig, effectiveCtTokens, fixedLength, setBracketedIndices, toggleBracketGroupByTextParse, ctParseMode, bracketedIndices, ctTokens]);

  // Wrap runAnalysis to capture pre-analysis state snapshot
  const runAnalysis = useCallback(() => {
    // Capture current state before running analysis
    preAnalysisStateRef.current = {
      ptRaw,
      ctRawSeparator: parsing.ctRawSeparator,
      ctRawFixed: parsing.ctRawFixed,
      ctParseMode: parsing.ctParseMode,
      separator: parsing.separator,
      fixedLength: parsing.fixedLength,
      keysPerPTMode,
      customPtGroups,
      bracketedIndices: parsing.bracketedIndices,
    };
    // Run the actual analysis
    runAnalysisCore();
  }, [ptRaw, parsing, keysPerPTMode, customPtGroups, runAnalysisCore]);

  /**
   * Reset to state before Run Analysis was clicked.
   * Restores PT, CT, parsing settings, and clears all derived state (locks, selections, merges).
   */
  const resetToPreAnalysis = useCallback(() => {
    if (!preAnalysisStateRef.current) {
      // If no snapshot exists, just clear suggestions
      setLockedKeys({});
      setSelections({});
      mapping.setManualPtCounts(null);
      return;
    }

    const snapshot = preAnalysisStateRef.current;
    
    // Restore to pre-analysis state
    setPtRaw(snapshot.ptRaw);
    parsing.setCtRawSeparator(snapshot.ctRawSeparator);
    parsing.setCtRawFixed(snapshot.ctRawFixed);
    parsing.setCtParseMode(snapshot.ctParseMode);
    parsing.setSeparator(snapshot.separator);
    parsing.setFixedLength(snapshot.fixedLength);
    setKeysPerPTMode(snapshot.keysPerPTMode);
    setCustomPtGroups(snapshot.customPtGroups);
    parsing.setBracketedIndices(snapshot.bracketedIndices);

    // Clear all analysis-derived state
    setLockedKeys({});
    setSelections({});
    setMergeAllPrompt(null);
    setHighlightedPTChar(null);
    
    // Clear status messages
    setSelectionError(null);
    
    // Reset manual shifting state for fixed-length mode
    mapping.setManualPtCounts(null);
  }, [parsing, setPtRaw, setKeysPerPTMode, setLockedKeys, setSelections, setCustomPtGroups, setMergeAllPrompt, setHighlightedPTChar, setSelectionError, mapping]);

  /**
   * Clear all persisted data and reset the entire application to defaults.
   * Removes localStorage entry and resets all state.
   */
  const clearAll = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setPtRaw('');
    parsing.setCtRawSeparator('');
    parsing.setCtRawFixed('');
    parsing.setBracketedIndices([]);
    setKeysPerPTMode('single');
    setCustomPtGroups(null);
    setLockedKeys({});
    setSelections({});
    setMergeAllPrompt(null);
    setHighlightedPTChar(null);
    setSelectionError(null);
    mapping.setManualPtCounts(null);
    preAnalysisStateRef.current = null;
  }, [parsing, setPtRaw, setKeysPerPTMode, setCustomPtGroups, setLockedKeys, setSelections, setMergeAllPrompt, setHighlightedPTChar, setSelectionError, mapping]);

  // Derived status: pure computation, no effect-based state sync.
  const { klamacStatus, statusMessage, bracketWarning } = useNomenklatorStatus({
    klamacStatusFromParse,
    statusMessageFromParse,
    bracketWarningFromParse,
    analysisDone,
    ptChars,
    ctTokens,
    effectiveCtTokens,
    ctParseMode,
    fixedLength,
    bracketedIndices,
  });

  // Debounce refreshes so rapid edits/locks don't block typing/dragging.
  // Adaptive delay: short texts stay responsive; large texts avoid UI jank.
  const analysisRefreshDelayMs = useMemo(() => {
    const size = Math.max(ptChars.length, effectiveCtTokens.length);
    if (size > 500) return 500;
    if (size > 200) return 300;
    if (size > 100) return 200;
    return 100;
  }, [ptChars.length, effectiveCtTokens.length]);

  const { debounced: refreshAnalysisPreserveDebounced, cancel: cancelRefreshDebounce } = useDebouncedCallback(
    () => {
      if (!analysisDone) return;
      refreshAnalysisPreserve();
    },
    analysisRefreshDelayMs
  );

  useAutoPickScoreOneSequential({
    candidatesByChar,
    ptRows,
    ctTokens,
    bracketedIndices,
    setSelections,
    keysPerPTMode,
  });

  useNomenklatorPersistence({
    settings,
    setSettings,
    hydratedRef: hydrated,
    ptRaw,
    setPtRaw,
    ctRaw,
    setCtRawSeparator,
    setCtRawFixed,
    keysPerPTMode,
    setKeysPerPTMode,
    setLockedKeys,
    setBracketedIndices,
    setCustomPtGroups,
  });

  const onLockOT = useCallback((pt: string, val: string) => {
    setLockedKeys(prev => {
      if (keysPerPTMode === 'multiple') {
        // In multi-key mode, add to array
        const current = Array.isArray(prev[pt]) ? prev[pt] : [];
        if (current.includes(val)) return prev; // already locked
        return { ...prev, [pt]: [...current, val] };
      }
      // Single-key mode: replace
      return { ...prev, [pt]: val };
    });
  }, [keysPerPTMode]);

  const onUnlockOT = useCallback((pt: string, specificToken?: string) => {
    setLockedKeys(prev => {
      if (keysPerPTMode === 'multiple' && specificToken) {
        // In multi-key mode, remove specific token
        const current = Array.isArray(prev[pt]) ? prev[pt] : [];
        const filtered = current.filter(t => t !== specificToken);
        if (filtered.length === 0) {
          const c = { ...prev };
          delete c[pt];
          return c;
        }
        return { ...prev, [pt]: filtered };
      }
      // Single-key mode or clear all: remove entire key
      const c = { ...prev };
      delete c[pt];
      return c;
    });
  }, [keysPerPTMode]);
  // drag behavior intentionally disabled in simplified mode

  // uniqueCTTokenTexts comes from parsing hook

  const previewSelection = useCallback(() => {
    const totalCells = ptRows.reduce((a, r) => a + r.filter(c => c.ch !== '').length, 0);
    let err: string | null = null;
    if (!bracketedIndices.length) {
      // When no deception/brackets are used, we can give the user quick feedback
      // about obvious token-count mismatches before committing locks.
      if (ctParseMode === 'fixedLength') {
        const groupSize = fixedLength || 1;
        // Treat groupSize as a maximum: allow final shorter group.
        // Number of logical groups equals ceil(total tokens / groupSize).
        const effGroups = Math.ceil(effectiveCtTokens.length / groupSize);
        if (effGroups > totalCells) {
          err = `Warning: too many CT groups by ${effGroups - totalCells}.`;
        }
      } else {
        if (effectiveCtTokens.length > totalCells) err = `Warning: CT tokens exceed PT by ${effectiveCtTokens.length - totalCells}.`;
      }
    }
    setSelectionError(err);
    return err;
  }, [bracketedIndices.length, effectiveCtTokens.length, fixedLength, ptRows, setSelectionError, ctParseMode]);

  // Choose suggestions where candidates have score==1 for that PT char.
  // Single mode: exactly one score==1 required (ambiguous = error).
  // Multi mode: all score==1 candidates are selected together (that's the point of homophones).
  const chooseScoreOneSuggestions = useCallback(() => {
    const gs = ctParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const precomputedOccMap = buildOccMap(effectiveCtTokens, gs);

    if (keysPerPTMode === 'multiple') {
      // In multi-key mode: for each PT char, pick ALL perfect candidates as an array.
      const picks: Record<string, string[]> = {};
      for (const [ch, list] of Object.entries(candidatesByChar)) {
        const perfect = list.filter(c => (c.occurrences || 0) > 0 && c.support === c.occurrences);
        if (perfect.length === 0) continue;
        const existing = normalizeToArray(selections[ch]);
        const merged = [...new Set([...existing, ...perfect.map(c => c.token)])];
        picks[ch] = merged;
      }
      if (Object.keys(picks).length) setSelections(prev => ({ ...prev, ...picks } as SelectionMap));
      setSelectionError(null);
      return true;
    }

    const picks: Record<string, string> = {};
    const ambiguous: string[] = [];
    for (const [ch, list] of Object.entries(candidatesByChar)) {
      // build candidate options to know which candidates are disabled by ordering/reserved rules
      const lockedVal = lockedKeys?.[ch];
      const normalizedLocked = Array.isArray(lockedVal) ? lockedVal[0] : lockedVal;
      const selectionVal = selections[ch];
      const normalizedSelection = Array.isArray(selectionVal) ? selectionVal[0] : selectionVal;

      const opts = list.map((c, idx) => buildCandidateOptions({
        c,
        idx,
        ch,
        ptRows,
        effectiveCtTokens,
        groupSize: gs,
        reservedTokens,
        selectionVal: normalizedSelection,
        lockedVal: normalizedLocked,
        sharedColumns: columns,
        _occMap: precomputedOccMap,
      }));
      // Determine "perfect" candidates by concrete evidence (support === occurrences)
      const enabledPerfect = opts.filter((opt, i) => !opt.disabled && (list[i].occurrences || 0) > 0 && list[i].support === list[i].occurrences);
      if (enabledPerfect.length > 1) {
        ambiguous.push(ch);
        continue;
      }
      if (enabledPerfect.length === 1) picks[ch] = enabledPerfect[0].token;
    }
    // Apply only the unambiguous picks, preserving existing selections for others
    if (Object.keys(picks).length) setSelections(prev => ({ ...prev, ...picks } as SelectionMap));
    if (ambiguous.length) {
      setSelectionError(`Ambiguous suggestions for ${ambiguous.join(', ')} (multiple score==1)`);
      return false;
    }
    setSelectionError(null);
    return true;
  }, [candidatesByChar, columns, effectiveCtTokens, fixedLength, keysPerPTMode, lockedKeys, ptRows, reservedTokens, selections, setSelectionError, setSelections, ctParseMode]);

  const editCtToken = useCallback((effIndex: number, newText: string) => {
    // Map effective index (skipping bracketed tokens) back to original index
    const effToOrig = buildEffectiveToOriginalIndexMap(ctTokens.length, bracketedIndices);
    const orig = effToOrig[effIndex] ?? effIndex;
    if (orig < 0 || orig >= ctTokens.length) return;
    const oldTokenText = ctTokens[orig].text;
    // Disallow editing of a token value that is currently locked: otherwise the
    // UI would silently invalidate the lock the user explicitly set.
    const lockedValues = new Set<string>();
    for (const val of Object.values(lockedKeys)) {
      const tokens = normalizeToArray(val);
      tokens.forEach(t => lockedValues.add(t));
    }
    if (lockedValues.has(oldTokenText)) return; // locked -> ignore edit
    const trimmed = newText.trim();
    if (!trimmed) return; // avoid empty tokens
    // If in fixedLength mode and length changed, switch to separator mode to preserve user intent
    let nextParseMode = ctParseMode;
    if (ctParseMode === 'fixedLength' && trimmed.length !== oldTokenText.length) {
      // Fixed-length mode implies strict character grouping; changing token length
      // is best represented as separator-mode tokens.
      nextParseMode = 'separator';
      setCtParseMode('separator');
    }
    // Build new token list
    const tokensArr = ctTokens.map(t => t.text);
    tokensArr[orig] = trimmed;
    // Revalidate locks: any lock whose value no longer exists is dropped
    const existingSet = new Set(tokensArr);
    setLockedKeys(prev => {
      const next: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        // Handle both single and multi-key formats
        if (Array.isArray(v)) {
          const surviving = v.filter(token => existingSet.has(token));
          if (surviving.length > 0) next[k] = surviving;
        } else if (existingSet.has(v)) {
          next[k] = v;
        }
      }
      return next;
    });
    // Rebuild raw string
    const newRaw = nextParseMode === 'separator' ? tokensArr.join(separator) : tokensArr.join('');
    // write raw into the appropriate mode-specific storage to avoid cross-mode propagation
    setCtRawForMode(nextParseMode, newRaw);
    if (analysisDone) setPendingAutoRefresh(true);
  }, [analysisDone, bracketedIndices, lockedKeys, separator, setLockedKeys, setPendingAutoRefresh, setCtParseMode, setCtRawForMode, ctParseMode, ctTokens]);

  const applySelection = useCallback(() => {
    const err = previewSelection();
    if (err) return;
    const newLocks: Record<string, string | string[]> = {};
    for (const [ch, seq] of Object.entries(selections)) {
      if (!seq) continue;
      if (keysPerPTMode === 'multiple') {
        // In multi-key mode, merge with existing locks
        const existing = normalizeToArray(lockedKeys[ch]);
        const selected = normalizeToArray(seq);
        const merged = [...new Set([...existing, ...selected])];
        if (merged.length > 0) newLocks[ch] = merged;
      } else {
        // Single-key mode: only lock if not already locked
        if (!lockedKeys[ch]) newLocks[ch] = seq as string;
      }
    }
    if (Object.keys(newLocks).length) {
      setLockedKeys(prev => ({ ...prev, ...newLocks }));
      // Clear selections after applying
      setSelections({});
    }
  }, [keysPerPTMode, lockedKeys, previewSelection, selections, setSelections]);

  // Merge adjacent PT groups: fromIndex merged into toIndex (concatenate text), only if toIndex is adjacent (fromIndex+1)
  const joinPTAt = useCallback((fromIndex: number, toIndex: number) => {
    const flat: PTChar[] = getFlatPTGroups();
    // Normalize to single-key format for this helper
    const normalizedLocks = normalizeLocks(lockedKeys);
    const res = tryJoinAdjacentPtGroups(flat, fromIndex, toIndex, normalizedLocks);
    if (!res) return;
    setCustomPtGroups(res.nextGroups);

    const remaining = countMergeableOccurrences(res.nextGroups, res.mergedText);
    setMergeAllPrompt(remaining > 0 ? { pattern: res.mergedText, remaining } : null);
  }, [countMergeableOccurrences, getFlatPTGroups, lockedKeys]);

  // Split a multi-char PT group at index back into single-character groups
  const splitPTAt = useCallback((index: number) => {
    const flat: PTChar[] = (customPtGroups && customPtGroups.length)
      ? customPtGroups
      : ptChars.filter(c => c.ch !== '');
    const next = splitPtGroupAt(flat, index);
    if (!next) return;
    setCustomPtGroups(next);
  }, [customPtGroups, ptChars]);

  const onDragStart = useCallback(() => {
    isDraggingRef.current = true;
    // Dragging performs multiple state updates quickly; pausing debounced refreshes
    // prevents "rubber-banding" suggestions mid-drag.
    cancelRefreshDebounce();
  }, [cancelRefreshDebounce]);

  const onDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    cancelRefreshDebounce();
  }, [cancelRefreshDebounce]);

  const onDragEnd = useCallback((evt: DragEndEvent) => {
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    if (!wasDragging) return; // prevent accidental merges from clicks
    const active = evt.active;
    const over = evt.over;
    if (!active || !over) return;
    const src = active.data?.current as DragData | undefined;
    const dst = over.data?.current as DragData | undefined;

    // If both source and target are CT tokens, allow swapping only when adjacent
    if (src?.type === 'ct' && dst?.type === 'ct') {
      const srcIndex = src.tokenIndex as number | undefined;
      const dstIndex = dst.tokenIndex as number | undefined;
      if (typeof srcIndex === 'number' && typeof dstIndex === 'number') {
        if (Math.abs(srcIndex - dstIndex) === 1) {
          // Prevent swaps when either token sits inside a locked PT cell.
          // Locks are a user assertion; swapping tokens under a lock would be surprising.
          // Normalize to single-key format for this helper
          const normalizedLocks = normalizeLocks(lockedKeys);
          if (tokenIndexIsLockedInColumns(columns, normalizedLocks, srcIndex)) return;
          if (tokenIndexIsLockedInColumns(columns, normalizedLocks, dstIndex)) return;

          const tokensArr = ctTokens.map(t => t.text);
          // swap
          const tmp = tokensArr[srcIndex];
          tokensArr[srcIndex] = tokensArr[dstIndex];
          tokensArr[dstIndex] = tmp;
          if (ctParseMode === 'separator') setCtRawForMode('separator', tokensArr.join(separator));
          else setCtRawForMode('fixedLength', tokensArr.join(''));
          if (analysisDone) setPendingAutoRefresh(true);
        }
      }
      return;
    }

    // Otherwise, treat as PT-cell merge operation
    const resolved = resolveMergeFromEvent(evt, columns);
    if (!resolved) return;
    joinPTAt(resolved.fromFlat, resolved.targetFlat);
  }, [analysisDone, columns, joinPTAt, lockedKeys, separator, setPendingAutoRefresh, setCtRawForMode, ctParseMode, ctTokens]);

  // Re-run analysis when PT grouping changes and we already have results
  React.useEffect(() => {
    if (analysisDone) refreshAnalysisPreserveDebounced();
  }, [customPtGroups, ptRows, analysisDone, refreshAnalysisPreserveDebounced]);

  // Insert raw characters after the group belonging to flat PT position (only fixedLength mode)
  const insertRawCharsAfterPosition = useCallback((positionIndex: number, text: string, replace = false) => {
    const res = computeInsertRawCharsAfterPosition({
      positionIndex,
      text,
      replace,
      ctParseMode,
      separator,
      ctTokens,
      bracketedIndices,
      columns,
    });
    if (!res) return;

    setBracketedIndices(res.nextBracketedIndices);
    setCtRawForMode(res.nextParseMode, res.nextRaw);
    if (analysisDone) setPendingAutoRefresh(true);
  }, [analysisDone, bracketedIndices, columns, separator, setBracketedIndices, setPendingAutoRefresh, setCtRawForMode, ctParseMode, ctTokens]);

  // Combined effect for: raw-edit insertions (pendingAutoRefresh), manual shifts,
  // lock/bracket/mode/length changes. All trigger the same debounced refresh once
  // analysis exists. Merged from the original four separate effects to reduce
  // scheduling overhead and make dep tracking explicit in one place.
  React.useEffect(() => {
    if (!analysisDone) return;

    if (pendingAutoRefresh) {
      refreshAnalysisPreserveDebounced();
      setPendingAutoRefresh(false);
      return;
    }

    // manualPtCounts, lockedKeys, bracketedIndices, ctParseMode, fixedLength changes
    // all warrant a refresh — no further gating needed (debouncer absorbs rapid calls).
    refreshAnalysisPreserveDebounced();
  }, [
    analysisDone,
    pendingAutoRefresh,
    manualPtCounts,
    lockedKeys,
    bracketedIndices,
    ctParseMode,
    fixedLength,
    refreshAnalysisPreserveDebounced,
  ]);

  // Refresh suggestions when the user makes manual selections (preview stage).
  // This ensures choosing a suggestion for one PT (e.g., `A -> 11`) immediately
  // updates candidate lists for other PT chars (e.g., `H`). Debounced to avoid
  // excessive work while the user changes selections rapidly.
  // Kept separate from the combined effect above because in multi-key mode,
  // refreshAnalysisPreserve itself calls setSelections, which would cause a
  // ping-pong cycle if selections were included in the same effect.
  React.useEffect(() => {
    if (!analysisDone) return;
    if (keysPerPTMode === 'multiple') return;
    // Only refresh when there is at least one selection to consider
    if (!selections || Object.keys(selections).length === 0) return;
    refreshAnalysisPreserveDebounced();
  }, [selections, analysisDone, keysPerPTMode, refreshAnalysisPreserveDebounced]);

  const { shiftRight, shiftLeft, extractEdgeToken, reabsorbNullToken, extractEdgeTokenByCtIndex, reabsorbNullByDirection } = mapping;

  /** User-editable inputs and their setters. Stable reference: only recreated when values change. */
  const inputs = useMemo(() => ({
    ptRaw,
    setPtRaw,
    ctRaw,
    setCtRaw,
    ctParseMode,
    setCtParseMode,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    keysPerPTMode,
    setKeysPerPTMode,
  }), [ptRaw, setPtRaw, ctRaw, setCtRaw, ctParseMode, setCtParseMode, separator, setSeparator, fixedLength, setFixedLength, keysPerPTMode, setKeysPerPTMode]);

  /** Mutable UI state (locks, selections, warnings, prompts). */
  const state = useMemo(() => ({
    lockedKeys,
    setLockedKeys,
    selections,
    setSelections,
    candidatesByChar,
    klamacStatus,
    statusMessage,
    bracketedIndices,
    setBracketedIndices,
    bracketWarning,
    analysisDone,
    isAnalyzing,
    selectionError,
    mergeAllPrompt,
    highlightedPTChar,
  }), [analysisDone, isAnalyzing, bracketWarning, bracketedIndices, candidatesByChar, highlightedPTChar, klamacStatus, lockedKeys, mergeAllPrompt, selectionError, selections, statusMessage, setBracketedIndices]);

  /** Derived data structures used to render tables/selectors. */
  const derived = useMemo(() => ({
    ptChars,
    ctTokens,
    effectiveCtTokens,
    ptRows,
    columns,
    uniqueCTTokenTexts,
    reservedTokens,
    shiftMeta,
  }), [columns, effectiveCtTokens, ptChars, ptRows, reservedTokens, shiftMeta, uniqueCTTokenTexts, ctTokens]);

  /** Actions/handlers that mutate state; safe to pass to child components. */
  const actions = useMemo(() => ({
    runAnalysis,
    onLockOT,
    onUnlockOT,
    onDragStart,
    onDragEnd,
    onDragCancel,
    toggleBracketGroupByText,
    previewSelection,
    chooseScoreOneSuggestions,
    applySelection,
    editCtToken,
    insertRawCharsAfterPosition,
    shiftGroupRight: shiftRight,
    shiftGroupLeft: shiftLeft,
    extractEdgeToken,
    reabsorbNullToken,
    extractEdgeTokenByCtIndex,
    reabsorbNullByDirection,
    joinPTAt,
    splitPTAt,
    mergeAllOccurrences,
    dismissMergeAllPrompt,
    toggleHighlightForOT,
    quickAssign,
    executeQuickAssign,
    resetToPreAnalysis,
    clearAll,
  }), [
    applySelection,
    chooseScoreOneSuggestions,
    clearAll,
    dismissMergeAllPrompt,
    editCtToken,
    insertRawCharsAfterPosition,
    joinPTAt,
    mergeAllOccurrences,
    onDragEnd,
    onDragStart,
    onDragCancel,
    onLockOT,
    onUnlockOT,
    previewSelection,
    runAnalysis,
    shiftLeft,
    shiftRight,
    extractEdgeToken,
    reabsorbNullToken,
    extractEdgeTokenByCtIndex,
    reabsorbNullByDirection,
    splitPTAt,
    toggleBracketGroupByText,
    toggleHighlightForOT,
    quickAssign,
    executeQuickAssign,
    resetToPreAnalysis,
  ]);

  return { inputs, state, derived, actions } as const;
}
