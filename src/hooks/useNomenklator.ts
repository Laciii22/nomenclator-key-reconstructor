import React, { useMemo, useRef, useState } from 'react';
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

  function toggleHighlightForOT(ch: string) {
    setHighlightedOTChar(prev => prev === ch ? null : ch);
  }

  // Derived sets
  const reservedTokens = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(lockedKeys)) if (v) set.add(v);
    for (const v of Object.values(selections)) if (v) set.add(v);
    return set;
  }, [lockedKeys, selections]);

  // Optional custom grouping of OT characters (supports merging adjacent OT cells)
  const [customOtGroups, setCustomOtGroups] = useState<OTChar[] | null>(null);
  const otChars = useMemo(() => {
    if (customOtGroups && customOtGroups.length) return customOtGroups;
    const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
    return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [otRaw, customOtGroups]);

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

  const COLS = 12;
  const otRows = useMemo(() => {
    const rows: { id: string; ch: string }[][] = [];
    for (let i = 0; i < otChars.length; i += COLS) rows.push(otChars.slice(i, i + COLS));
    return rows.length ? rows : [[]];
  }, [otChars]);

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

  const { candidatesByChar, analysisDone, runAnalysis, refreshAnalysisPreserve } = analysis;

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

  function onLockOT(ot: string, val: string) { setLockedKeys(prev => ({ ...prev, [ot]: val })); }
  function onUnlockOT(ot: string) { setLockedKeys(prev => { const c = { ...prev }; delete c[ot]; return c; }); }
  // drag behavior intentionally disabled in simplified mode

  // uniqueZTTokenTexts comes from parsing hook

  function previewSelection() {
    const totalCells = otRows.reduce((a, r) => a + r.filter(c => c.ch !== '').length, 0);
    let err: string | null = null;
    if (!bracketedIndices.length) {
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
  }

  // Choose suggestions where exactly one candidate has score==1 for that OT char.
  // If any OT char has more than one score==1 candidate, abort and set an error.
  function chooseScoreOneSuggestions() {
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
  }

  function editZtToken(effIndex: number, newText: string) {
    // Map effective index (skipping bracketed tokens) back to original index
    const br = new Set(bracketedIndices);
    const effToOrig: number[] = [];
    for (let i = 0; i < ztTokens.length; i++) if (!br.has(i)) effToOrig.push(i);
    const orig = effToOrig[effIndex] ?? effIndex;
    if (orig < 0 || orig >= ztTokens.length) return;
    const oldTokenText = ztTokens[orig].text;
    // Disallow editing if this token text is currently locked for any OT char
    const lockedValues = new Set(Object.values(lockedKeys));
    if (lockedValues.has(oldTokenText)) return; // locked -> ignore edit
    const trimmed = newText.trim();
    if (!trimmed) return; // avoid empty tokens
    // If in fixedLength mode and length changed, switch to separator mode to preserve user intent
    let nextParseMode = ztParseMode;
    if (ztParseMode === 'fixedLength' && trimmed.length !== oldTokenText.length) {
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
  }

  function applySelection() {
    const err = previewSelection();
    if (err) return;
    const newLocks: Record<string, string> = {};
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) newLocks[ch] = seq as string;
    if (Object.keys(newLocks).length) setLockedKeys(prev => ({ ...prev, ...newLocks }));
  }

  // Merge adjacent OT groups: fromIndex merged into toIndex (concatenate text), only if toIndex is adjacent (fromIndex+1)
  function joinOTAt(fromIndex: number, toIndex: number) {
    const flat: OTChar[] = (customOtGroups && customOtGroups.length)
      ? customOtGroups
      : otChars.filter(c => c.ch !== '');
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= flat.length || toIndex >= flat.length) return;
    // Only allow merging when dropping onto the immediate next OT
    if (toIndex !== fromIndex + 1) return;
    const a = flat[fromIndex];
    const b = flat[toIndex];
    const merged: OTChar = { id: `${a.id}_merge_${b.id}`, ch: `${a.ch}${b.ch}` };
    const next = [...flat];
    next.splice(fromIndex, 2, merged);
    setCustomOtGroups(next);
  }

  // Split a multi-char OT group at index back into single-character groups
  function splitOTAt(index: number) {
    const flat: OTChar[] = (customOtGroups && customOtGroups.length)
      ? customOtGroups
      : otChars.filter(c => c.ch !== '');
    if (index < 0 || index >= flat.length) return;
    const cur = flat[index];
    if (!cur || !cur.ch || cur.ch.length <= 1) return;
    const singles: OTChar[] = Array.from(cur.ch).map((ch, i) => ({ id: `${cur.id}_s${i}`, ch }));
    const next = [...flat];
    next.splice(index, 1, ...singles);
    setCustomOtGroups(next);
  }

  function onDragStart() {
    isDraggingRef.current = true;
    cancelRefreshDebounce();
  }

  function onDragEnd(evt: DragEndEvent) {
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    if (!wasDragging) return; // prevent accidental merges from clicks
    const active = evt.active;
    const over = evt.over;
    if (!active || !over) return;
    const src = active.data?.current as any;
    const dst = over.data?.current as any;

    // If both source and target are ZT tokens, allow swapping only when adjacent
    if (src?.type === 'zt' && dst?.type === 'zt') {
      const srcIndex = src.tokenIndex as number | undefined;
      const dstIndex = dst.tokenIndex as number | undefined;
      if (typeof srcIndex === 'number' && typeof dstIndex === 'number') {
        if (Math.abs(srcIndex - dstIndex) === 1) {
          // Prevent swaps when either token sits inside a locked OT cell
          const tokenIndexIsLocked = (ti: number) => {
            for (const row of columns) {
              for (const cell of row) {
                if (cell.zt && cell.zt.includes(ti)) {
                  if (cell.ot && typeof lockedKeys?.[cell.ot.ch] === 'string') return true;
                }
              }
            }
            return false;
          };
          if (tokenIndexIsLocked(srcIndex) || tokenIndexIsLocked(dstIndex)) return;

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
  }

  // Re-run analysis when OT grouping changes and we already have results
  React.useEffect(() => {
    if (analysisDone) refreshAnalysisPreserveDebounced();
  }, [customOtGroups, otRows, analysisDone, refreshAnalysisPreserveDebounced]);

  // Insert raw characters after the group belonging to flat OT position (only fixedLength mode)
  function insertRawCharsAfterPosition(positionIndex: number, text: string, replace = false) {
    if (ztParseMode !== 'fixedLength') return;
    const chars = Array.from(text).filter(ch => ch.trim() !== '');
    if (!chars.length) return;
    // Build flat mapping of OT positions to last raw token index used
    const flatColumns: { otCh: string | null; indices: number[] }[] = [];
    for (const row of columns) for (const col of row) flatColumns.push({ otCh: col.ot ? col.ot.ch : null, indices: col.zt });
    const target = flatColumns.filter(f => f.otCh != null)[positionIndex];
    // Determine insertion point = 1 + max index of target group (or end if none)
    const afterIndex = target && target.indices.length ? Math.max(...target.indices) + 1 : effectiveZtTokens.length;
    const rawArr = effectiveZtTokens.map(t => t.text);
    // Insert or replace at computed position
    const safeIndex = Math.min(afterIndex, rawArr.length);
    if (replace && target) {
      const startIndex = target && target.indices && target.indices.length ? Math.min(...target.indices) : safeIndex;
      const deleteCount = target && target.indices ? target.indices.length : 0;
      rawArr.splice(startIndex, deleteCount, ...chars);
    } else {
      rawArr.splice(safeIndex, 0, ...chars);
    }
    // Update fixed-length raw only (do not touch separator raw)
    setZtRawForMode('fixedLength', rawArr.join(''));
    if (analysisDone) setPendingAutoRefresh(true);
  }

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

  return {
    // inputs
    otRaw, setOtRaw,
    ztRaw, setZtRaw,
    ztParseMode, setZtParseMode,
    separator, setSeparator,
    fixedLength, setFixedLength,
    keysPerOTMode, setKeysPerOTMode,
    // state
    lockedKeys, setLockedKeys,
    selections, setSelections,
    candidatesByChar,
    klamacStatus, statusMessage,
    bracketedIndices, setBracketedIndices,
    bracketWarning,
    analysisDone,
    selectionError,
    // derived
    otChars, ztTokens, effectiveZtTokens,
    otRows, columns,
    uniqueZTTokenTexts, reservedTokens,
    // actions
    runAnalysis,
    onLockOT, onUnlockOT,
    onDragStart,
    onDragEnd,
    toggleBracketGroupByText,
    previewSelection,
    chooseScoreOneSuggestions,
    applySelection,
    editZtToken,
    insertRawCharsAfterPosition,
    shiftMeta,
    shiftGroupRight: mapping.shiftRight,
    shiftGroupLeft: mapping.shiftLeft,
    joinOTAt,
    splitOTAt,
    // highlighting
    highlightedOTChar,
    toggleHighlightForOT,
  } as const;
}
