import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeysPerOTMode, OTChar } from '../components/types';
import { useLocalSettings } from './useLocalSettings';
import type { SelectionMap } from '../utils/analyzer';
import { resolveMergeFromEvent } from '../utils/dnd';
import { buildCandidateOptions } from '../components/controls/candidateHelpers';
import type { DragEndEvent } from '@dnd-kit/core';
import { useParsing } from './useParsing';
import { useMapping } from './useMapping';
import { useAnalysis } from './useAnalysis';
import { useNomenklatorPersistence } from './useNomenklatorPersistence';
import { useNomenklatorStatus } from './useNomenklatorStatus';
import { useAutoPickScoreOneSequential } from './useAutoPickScoreOneSequential';
import { useDebouncedCallback } from './useDebouncedCallback';
import { buildEffectiveToOriginalIndexMap } from './nomenclator/ztIndexMaps';
import { tokenIndexIsLockedInColumns } from './nomenclator/dndRules';
import {
  countMergeableOccurrences as countMergeableOccurrencesHelper,
  mergeAllOccurrences as mergeAllOccurrencesHelper,
  splitOtGroupAt,
  tryJoinAdjacentOtGroups,
} from './nomenclator/otGrouping';
import { computeInsertRawCharsAfterPosition } from './nomenclator/insertRawAfterPosition';

/**
 * Responsive breakpoints for OT grid layout.
 * Based on Tailwind breakpoints: sm=640, md=768, lg=1024, xl=1280, 2xl=1536
 */
const RESPONSIVE_BREAKPOINTS = [
  { maxWidth: 640, columns: 10 },
  { maxWidth: 768, columns: 12 },
  { maxWidth: 1024, columns: 16 },
  { maxWidth: 1280, columns: 20 },
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
  const [settings, setSettings] = useLocalSettings({ keysPerOTMode: 'single' });
  const hydrated = useRef(false);

  // Inputs & modes
  const [otRaw, setOtRaw] = useState('');
  const [keysPerOTMode, setKeysPerOTMode] = useState<KeysPerOTMode>('single');

  // Locks & selections
  const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [pendingAutoRefresh, setPendingAutoRefresh] = useState(false);
  const isDraggingRef = useRef(false);

  // Status / warnings
  const [klamacStatus, setKlamacStatus] = useState<'none' | 'needsKlamac' | 'ok' | 'invalid'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  // parsing hook owns bracket state, but we keep warning/error state in return
  const [bracketWarning, setBracketWarning] = useState<string | null>(null);

  // Highlighting: single OT character to visually emphasize across the grid
  const [highlightedOTChar, setHighlightedOTChar] = useState<string | null>(null);

  const toggleHighlightForOT = useCallback((ch: string) => {
    setHighlightedOTChar(prev => prev === ch ? null : ch);
  }, []);

  // Derived sets
  const reservedTokens = useMemo(() => {
    const set = new Set<string>();
    // Keep already-chosen tokens unavailable to other OTs to avoid the UI
    // suggesting collisions that the user would immediately have to undo.
    for (const v of Object.values(lockedKeys)) if (v) set.add(v);
    for (const v of Object.values(selections)) if (v) set.add(v);
    return set;
  }, [lockedKeys, selections]);

  // Optional custom grouping of OT characters (supports merging adjacent OT cells)
  const [customOtGroups, setCustomOtGroups] = useState<OTChar[] | null>(null);
  const [mergeAllPrompt, setMergeAllPrompt] = useState<{ pattern: string; remaining: number } | null>(null);
  const otChars = useMemo(() => {
    if (customOtGroups && customOtGroups.length) return customOtGroups;
    const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
    return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [otRaw, customOtGroups]);

  const getFlatOTGroups = useCallback((): OTChar[] => {
    return (customOtGroups && customOtGroups.length)
      ? customOtGroups
      : otChars.filter(c => c.ch !== '');
  }, [customOtGroups, otChars]);

  const countMergeableOccurrences = useCallback((groups: OTChar[], pattern: string) => {
    return countMergeableOccurrencesHelper(groups, pattern, lockedKeys);
  }, [lockedKeys]);

  const mergeAllOccurrences = useCallback((pattern: string) => {
    const flat = getFlatOTGroups();
    const res = mergeAllOccurrencesHelper(flat, pattern, lockedKeys);
    if (!res) return;
    setCustomOtGroups(res.nextGroups);
    setMergeAllPrompt(res.remaining > 0 ? { pattern: res.target, remaining: res.remaining } : null);
  }, [countMergeableOccurrences, getFlatOTGroups, lockedKeys]);

  const dismissMergeAllPrompt = useCallback(() => {
    setMergeAllPrompt(null);
  }, []);

  const parsing = useParsing({ otCount: otChars.length });
  const {
    ztParseMode,
    setZtParseMode,
    ztRaw,
    setZtRaw,
    setZtRawForMode,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    groupSize,
    ztTokens,
    effectiveZtTokens,
    bracketedIndices,
    setBracketedIndices,
    toggleBracketGroupByText,
    uniqueZTTokenTexts,
    klamacStatus: klamacStatusFromParse,
    statusMessage: statusMessageFromParse,
    bracketWarning: bracketWarningFromParse,
    setZtRawSeparator,
    setZtRawFixed,
  } = parsing;

  // Responsive OT grid width.
  // This intentionally affects only layout (row wrapping), not mapping/analysis rules.
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true } as any);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const OT_COLUMNS_PER_ROW = useMemo(() => {
    for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
      if (viewportWidth < breakpoint.maxWidth) {
        return breakpoint.columns;
      }
    }
    return RESPONSIVE_BREAKPOINTS[RESPONSIVE_BREAKPOINTS.length - 1].columns;
  }, [viewportWidth]);
  const otRows = useMemo(() => {
    const rows: { id: string; ch: string }[][] = [];
    for (let i = 0; i < otChars.length; i += OT_COLUMNS_PER_ROW) rows.push(otChars.slice(i, i + OT_COLUMNS_PER_ROW));
    return rows.length ? rows : [[]];
  }, [otChars, OT_COLUMNS_PER_ROW]);

  const mapping = useMapping({
    otRows,
    effectiveZtTokens,
    lockedKeys,
    selections,
    ztParseMode,
    groupSize,
  });

  const { columns, manualOtCounts, shiftMeta } = mapping;

  const analysis = useAnalysis({
    otRows,
    ztParseMode,
    fixedLength,
    effectiveZtTokens,
    columns,
    keysPerOTMode,
    lockedKeys,
    setSelections,
  });

  const { candidatesByChar, analysisDone, isAnalyzing, runAnalysis, refreshAnalysisPreserve } = analysis;

  // Now that analysisDone is known, let status hook compute the derived post-analysis status as well.
  useNomenklatorStatus({
    klamacStatusFromParse,
    statusMessageFromParse,
    bracketWarningFromParse,
    setKlamacStatus,
    setStatusMessage,
    setBracketWarning,
    analysisDone,
    otChars,
    ztTokens,
    effectiveZtTokens,
    ztParseMode,
    fixedLength,
    bracketedIndices,
  });

  // Debounce refreshes so rapid edits/locks don't block typing/dragging.
  const { debounced: refreshAnalysisPreserveDebounced, cancel: cancelRefreshDebounce } = useDebouncedCallback(
    () => {
      if (!analysisDone) return;
      refreshAnalysisPreserve();
    },
    150
  );

  useAutoPickScoreOneSequential({
    candidatesByChar,
    otRows,
    ztTokens,
    bracketedIndices,
    setSelections,
  });

  useNomenklatorPersistence({
    settings,
    setSettings,
    hydratedRef: hydrated,
    otRaw,
    setOtRaw,
    ztRaw,
    setZtRawSeparator,
    setZtRawFixed,
    keysPerOTMode,
    setKeysPerOTMode,
    setLockedKeys,
    setBracketedIndices,
    setCustomOtGroups,
  });

  const onLockOT = useCallback((ot: string, val: string) => {
    setLockedKeys(prev => ({ ...prev, [ot]: val }));
  }, []);

  const onUnlockOT = useCallback((ot: string) => {
    setLockedKeys(prev => {
      const c = { ...prev };
      delete c[ot];
      return c;
    });
  }, []);
  // drag behavior intentionally disabled in simplified mode

  // uniqueZTTokenTexts comes from parsing hook

  const previewSelection = useCallback(() => {
    const totalCells = otRows.reduce((a, r) => a + r.filter(c => c.ch !== '').length, 0);
    let err: string | null = null;
    if (!bracketedIndices.length) {
      // When no deception/brackets are used, we can give the user quick feedback
      // about obvious token-count mismatches before committing locks.
      if (ztParseMode === 'fixedLength') {
        const groupSize = fixedLength || 1;
        const effGroups = Math.floor(effectiveZtTokens.length / groupSize);
        const leftover = effectiveZtTokens.length % groupSize;
        if (leftover !== 0) {
          err = `Incomplete group: missing ${groupSize - leftover} character(s).`;
        } else if (effGroups > totalCells) {
          err = `Warning: too many ZT groups by ${effGroups - totalCells}.`;
        }
      } else {
        if (effectiveZtTokens.length > totalCells) err = `Warning: ZT tokens exceed OT by ${effectiveZtTokens.length - totalCells}.`;
      }
    }
    setSelectionError(err);
    return err;
  }, [bracketedIndices.length, effectiveZtTokens.length, fixedLength, otRows, setSelectionError, ztParseMode]);

  // Choose suggestions where exactly one candidate has score==1 for that OT char.
  // If any OT char has more than one score==1 candidate, abort and set an error.
  const chooseScoreOneSuggestions = useCallback(() => {
    const picks: Record<string, string> = {};
    const ambiguous: string[] = [];
    const gs = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    for (const [ch, list] of Object.entries(candidatesByChar)) {
      // build candidate options to know which candidates are disabled by ordering/reserved rules
      const opts = list.map((c, idx) => buildCandidateOptions({ c, idx, ch, otRows, effectiveZtTokens, groupSize: gs, reservedTokens, selectionVal: selections[ch], lockedVal: lockedKeys?.[ch], sharedColumns: columns }));
      const enabledScore1 = opts.filter((opt, i) => !opt.disabled && list[i].score === 1);
      if (enabledScore1.length > 1) {
        ambiguous.push(ch);
        continue;
      }
      if (enabledScore1.length === 1) picks[ch] = enabledScore1[0].token;
    }
    // Apply only the unambiguous picks, preserving existing selections for others
    if (Object.keys(picks).length) setSelections(prev => ({ ...prev, ...picks } as SelectionMap));
    if (ambiguous.length) {
      setSelectionError(`Ambiguous suggestions for ${ambiguous.join(', ')} (multiple score==1)`);
      return false;
    }
    setSelectionError(null);
    return true;
  }, [candidatesByChar, columns, effectiveZtTokens, fixedLength, lockedKeys, otRows, reservedTokens, selections, setSelectionError, setSelections, ztParseMode]);

  const editZtToken = useCallback((effIndex: number, newText: string) => {
    // Map effective index (skipping bracketed tokens) back to original index
    const effToOrig = buildEffectiveToOriginalIndexMap(ztTokens.length, bracketedIndices);
    const orig = effToOrig[effIndex] ?? effIndex;
    if (orig < 0 || orig >= ztTokens.length) return;
    const oldTokenText = ztTokens[orig].text;
    // Disallow editing of a token value that is currently locked: otherwise the
    // UI would silently invalidate the lock the user explicitly set.
    const lockedValues = new Set(Object.values(lockedKeys));
    if (lockedValues.has(oldTokenText)) return; // locked -> ignore edit
    const trimmed = newText.trim();
    if (!trimmed) return; // avoid empty tokens
    // If in fixedLength mode and length changed, switch to separator mode to preserve user intent
    let nextParseMode = ztParseMode;
    if (ztParseMode === 'fixedLength' && trimmed.length !== oldTokenText.length) {
      // Fixed-length mode implies strict character grouping; changing token length
      // is best represented as separator-mode tokens.
      nextParseMode = 'separator';
      setZtParseMode('separator');
    }
    // Build new token list
    const tokensArr = ztTokens.map(t => t.text);
    tokensArr[orig] = trimmed;
    // Revalidate locks: any lock whose value no longer exists is dropped
    const existingSet = new Set(tokensArr);
    setLockedKeys(prev => {
      const next: Record<string,string> = {};
      for (const [k,v] of Object.entries(prev)) if (existingSet.has(v)) next[k] = v; // keep only surviving lock values
      return next;
    });
    // Rebuild raw string
    const newRaw = nextParseMode === 'separator' ? tokensArr.join(separator) : tokensArr.join('');
    // write raw into the appropriate mode-specific storage to avoid cross-mode propagation
    setZtRawForMode(nextParseMode, newRaw);
    if (analysisDone) setPendingAutoRefresh(true);
  }, [analysisDone, bracketedIndices, lockedKeys, separator, setLockedKeys, setPendingAutoRefresh, setZtParseMode, setZtRawForMode, ztParseMode, ztTokens]);

  const applySelection = useCallback(() => {
    const err = previewSelection();
    if (err) return;
    const newLocks: Record<string, string> = {};
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) newLocks[ch] = seq as string;
    if (Object.keys(newLocks).length) setLockedKeys(prev => ({ ...prev, ...newLocks }));
  }, [lockedKeys, previewSelection, selections]);

  // Merge adjacent OT groups: fromIndex merged into toIndex (concatenate text), only if toIndex is adjacent (fromIndex+1)
  const joinOTAt = useCallback((fromIndex: number, toIndex: number) => {
    const flat: OTChar[] = getFlatOTGroups();
    const res = tryJoinAdjacentOtGroups(flat, fromIndex, toIndex, lockedKeys);
    if (!res) return;
    setCustomOtGroups(res.nextGroups);

    const remaining = countMergeableOccurrences(res.nextGroups, res.mergedText);
    setMergeAllPrompt(remaining > 0 ? { pattern: res.mergedText, remaining } : null);
  }, [countMergeableOccurrences, getFlatOTGroups, lockedKeys]);

  // Split a multi-char OT group at index back into single-character groups
  const splitOTAt = useCallback((index: number) => {
    const flat: OTChar[] = (customOtGroups && customOtGroups.length)
      ? customOtGroups
      : otChars.filter(c => c.ch !== '');
    const next = splitOtGroupAt(flat, index);
    if (!next) return;
    setCustomOtGroups(next);
  }, [customOtGroups, otChars]);

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

  interface DragData {
    type?: 'zt' | 'ot';
    tokenIndex?: number;
    sourceRow?: number;
    sourceCol?: number;
    row?: number;
    col?: number;
  }

  const onDragEnd = useCallback((evt: DragEndEvent) => {
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    if (!wasDragging) return; // prevent accidental merges from clicks
    const active = evt.active;
    const over = evt.over;
    if (!active || !over) return;
    const src = active.data?.current as DragData | undefined;
    const dst = over.data?.current as DragData | undefined;

    // If both source and target are ZT tokens, allow swapping only when adjacent
    if (src?.type === 'zt' && dst?.type === 'zt') {
      const srcIndex = src.tokenIndex as number | undefined;
      const dstIndex = dst.tokenIndex as number | undefined;
      if (typeof srcIndex === 'number' && typeof dstIndex === 'number') {
        if (Math.abs(srcIndex - dstIndex) === 1) {
          // Prevent swaps when either token sits inside a locked OT cell.
          // Locks are a user assertion; swapping tokens under a lock would be surprising.
          if (tokenIndexIsLockedInColumns(columns, lockedKeys, srcIndex)) return;
          if (tokenIndexIsLockedInColumns(columns, lockedKeys, dstIndex)) return;

          const tokensArr = ztTokens.map(t => t.text);
          // swap
          const tmp = tokensArr[srcIndex];
          tokensArr[srcIndex] = tokensArr[dstIndex];
          tokensArr[dstIndex] = tmp;
          if (ztParseMode === 'separator') setZtRawForMode('separator', tokensArr.join(separator));
          else setZtRawForMode('fixedLength', tokensArr.join(''));
          if (analysisDone) setPendingAutoRefresh(true);
        }
      }
      return;
    }

    // Otherwise, treat as OT-cell merge operation
    const resolved = resolveMergeFromEvent(evt, columns);
    if (!resolved) return;
    joinOTAt(resolved.fromFlat, resolved.targetFlat);
  }, [analysisDone, columns, joinOTAt, lockedKeys, separator, setPendingAutoRefresh, setZtRawForMode, ztParseMode, ztTokens]);

  // Re-run analysis when OT grouping changes and we already have results
  React.useEffect(() => {
    if (analysisDone) refreshAnalysisPreserveDebounced();
  }, [customOtGroups, otRows, analysisDone, refreshAnalysisPreserveDebounced]);

  // Insert raw characters after the group belonging to flat OT position (only fixedLength mode)
  const insertRawCharsAfterPosition = useCallback((positionIndex: number, text: string, replace = false) => {
    const res = computeInsertRawCharsAfterPosition({
      positionIndex,
      text,
      replace,
      ztParseMode,
      separator,
      ztTokens,
      bracketedIndices,
      columns,
    });
    if (!res) return;

    setBracketedIndices(res.nextBracketedIndices);
    setZtRawForMode(res.nextParseMode, res.nextRaw);
    if (analysisDone) setPendingAutoRefresh(true);
  }, [analysisDone, bracketedIndices, columns, separator, setBracketedIndices, setPendingAutoRefresh, setZtRawForMode, ztParseMode, ztTokens]);

  // Auto refresh analysis after raw edits/insertions when analysis already computed
  React.useEffect(() => {
    if (pendingAutoRefresh && analysisDone) {
      refreshAnalysisPreserveDebounced();
      setPendingAutoRefresh(false);
    }
  }, [pendingAutoRefresh, analysisDone, ztTokens, fixedLength, ztParseMode, refreshAnalysisPreserveDebounced]);

  // When manual shift counts change in fixed-length mode and analysis has been
  // run at least once, automatically refresh suggestions so the dropdowns
  // immediately reflect the new OT→ZT mapping (e.g. O → 33) without needing
  // to click "Run analysis" again.
  React.useEffect(() => {
    if (ztParseMode !== 'fixedLength') return;
    if (!analysisDone) return;
    if (!manualOtCounts) return;
    refreshAnalysisPreserveDebounced();
  }, [manualOtCounts, analysisDone, ztParseMode, refreshAnalysisPreserveDebounced]);

  // Keep candidates in sync with lock/bracket changes once analysis exists.
  React.useEffect(() => {
    if (!analysisDone) return;
    refreshAnalysisPreserveDebounced();
  }, [analysisDone, lockedKeys, bracketedIndices, ztParseMode, fixedLength, refreshAnalysisPreserveDebounced]);

  const { shiftRight, shiftLeft } = mapping;

  /** User-editable inputs and their setters. */
  const inputs = useMemo(() => ({
    otRaw,
    setOtRaw,
    ztRaw,
    setZtRaw,
    ztParseMode,
    setZtParseMode,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    keysPerOTMode,
    setKeysPerOTMode,
  }), [fixedLength, keysPerOTMode, otRaw, separator, ztParseMode, ztRaw]);

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
    highlightedOTChar,
  }), [analysisDone, isAnalyzing, bracketWarning, bracketedIndices, candidatesByChar, highlightedOTChar, klamacStatus, lockedKeys, mergeAllPrompt, selectionError, selections, statusMessage]);

  /** Derived data structures used to render tables/selectors. */
  const derived = useMemo(() => ({
    otChars,
    ztTokens,
    effectiveZtTokens,
    otRows,
    columns,
    uniqueZTTokenTexts,
    reservedTokens,
    shiftMeta,
  }), [columns, effectiveZtTokens, otChars, otRows, reservedTokens, shiftMeta, uniqueZTTokenTexts, ztTokens]);

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
    editZtToken,
    insertRawCharsAfterPosition,
    shiftGroupRight: shiftRight,
    shiftGroupLeft: shiftLeft,
    joinOTAt,
    splitOTAt,
    mergeAllOccurrences,
    dismissMergeAllPrompt,
    toggleHighlightForOT,
  }), [
    applySelection,
    chooseScoreOneSuggestions,
    dismissMergeAllPrompt,
    editZtToken,
    insertRawCharsAfterPosition,
    joinOTAt,
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
    splitOTAt,
    toggleBracketGroupByText,
    toggleHighlightForOT,
  ]);

  return { inputs, state, derived, actions } as const;
}
