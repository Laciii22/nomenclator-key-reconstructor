import React, { useMemo, useRef, useState } from 'react';
import type { KeysPerOTMode, OTChar, ZTToken } from '../components/types';
import { useLocalSettings } from './useLocalSettings';
import { analyze, type Candidate, type SelectionMap } from '../utils/analyzer';
import { computeRowAlloc } from '../utils/allocation';
import { getExpectedZTIndicesForOT } from '../utils/grouping';
import { buildShiftOnlyColumns } from '../utils/shiftMapping';
import { uniqueGroupTexts, toggleBracketByGroupText } from '../utils/parse/fixedLength';
import { parseSeparatorRaw } from '../utils/parse/separator';
import { parseFixedRaw } from '../utils/parse/fixed';
import buildLogicalTokens from '../utils/parse/logicalTokens';
import { resolveMergeFromEvent } from '../utils/dnd';
import { buildCandidateOptions } from '../components/controls/candidateHelpers';
import type { DragEndEvent } from '@dnd-kit/core';

export function useNomenklator() {
  const [settings, setSettings] = useLocalSettings({ keysPerOTMode: 'single' });
  const hydrated = useRef(false);

  // Inputs & modes
  const [otRaw, setOtRaw] = useState('');
  const [ztParseMode, setZtParseMode] = useState<'separator' | 'fixedLength'>('separator');
  // Separate raw inputs per parse mode so edits in one mode don't overwrite the other
  const [ztRawSeparator, setZtRawSeparator] = useState('');
  const [ztRawFixed, setZtRawFixed] = useState('');
  const ztRaw = ztParseMode === 'fixedLength' ? ztRawFixed : ztRawSeparator;
  const setZtRawActive = (v: string) => { if (ztParseMode === 'fixedLength') setZtRawFixed(v); else setZtRawSeparator(v); };
  const setZtRawForMode = (mode: 'separator' | 'fixedLength', v: string) => { if (mode === 'fixedLength') setZtRawFixed(v); else setZtRawSeparator(v); };
  const [separator, setSeparator] = useState<string>(':');
  const [fixedLength, setFixedLength] = useState<number>(1);
  const [keysPerOTMode, setKeysPerOTMode] = useState<KeysPerOTMode>('single');

  // Locks & selections
  const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [candidatesByChar, setCandidatesByChar] = useState<Record<string, Candidate[]>>({});
  const [analysisDone, setAnalysisDone] = useState(false);
  const [pendingAutoRefresh, setPendingAutoRefresh] = useState(false);
  const isDraggingRef = useRef(false);

  // Status / warnings
  const [klamacStatus, setKlamacStatus] = useState<'none' | 'needsKlamac' | 'ok' | 'invalid'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [bracketWarning, setBracketWarning] = useState<string | null>(null);

  // Brackets
  const [bracketedIndices, setBracketedIndices] = useState<number[]>([]);

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

  // Raw ZT tokens are always single characters in fixedLength mode (for easier editing)
  // In separator mode they are split by separator.
  const ztTokens = useMemo<ZTToken[]>(() => {
    // delegate parsing & status determination to mode-specific helpers
    if (ztParseMode === 'separator') {
      const res = parseSeparatorRaw(ztRaw, separator, otChars.length);
      setKlamacStatus(res.klamacStatus);
      setStatusMessage(res.statusMessage);
      return res.tokens;
    }
    const res = parseFixedRaw(ztRaw, fixedLength || 1, otChars.length);
    setKlamacStatus(res.klamacStatus);
    setStatusMessage(res.statusMessage);
    return res.tokens;
  }, [ztRaw, ztParseMode, separator, fixedLength, otChars.length]);
  

  const effectiveZtTokens = useMemo(() => {
    if (!bracketedIndices.length) return ztTokens;
    const br = new Set(bracketedIndices);
    return ztTokens.filter((_, i) => !br.has(i));
  }, [ztTokens, bracketedIndices]);

  const COLS = 12;
  const otRows = useMemo(() => {
    const rows: { id: string; ch: string }[][] = [];
    for (let i = 0; i < otChars.length; i += COLS) rows.push(otChars.slice(i, i + COLS));
    return rows.length ? rows : [[]];
  }, [otChars]);

  // Shift-only columns mapping with deception cells
  const columns = useMemo(() => {
    const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    return buildShiftOnlyColumns(otRows, effectiveZtTokens, lockedKeys, selections, groupSize);
  }, [otRows, effectiveZtTokens, lockedKeys, selections, ztParseMode, fixedLength]);

  // Auto-select candidates with score==1 matching sequential expected indices
  React.useEffect(() => {
    if (!Object.keys(candidatesByChar).length) return;
    const expected = getExpectedZTIndicesForOT(otRows, ztTokens, bracketedIndices);
    setSelections(prev => {
      const next = { ...prev };
      for (const [ch, list] of Object.entries(candidatesByChar)) {
        if (next[ch]) continue;
        const score1 = list.filter(c => c.score === 1);
        if (score1.length !== 1) continue;
        const token = score1[0].token;
        const indices = ztTokens.map((t, i) => t.text === token ? i : -1).filter(i => i >= 0);
        const exp = expected[ch] || [];
        if (indices.length === exp.length && indices.every((v, i) => v === exp[i])) next[ch] = token;
      }
      return next;
    });
  }, [candidatesByChar, otRows, ztTokens, bracketedIndices]);

  // Hydration (avoid stale stale locks + brackets)
  React.useEffect(() => {
    if (hydrated.current) return;
    setOtRaw(settings.otRaw ?? '');
    // initialize both mode-specific raws from saved value to avoid surprising empty fields
    setZtRawSeparator(settings.ztRaw ?? '');
    setZtRawFixed(settings.ztRaw ?? '');
    setKeysPerOTMode((settings.keysPerOTMode as KeysPerOTMode) ?? 'single');
    setLockedKeys({});
    setBracketedIndices([]);
    setCustomOtGroups(null);
    hydrated.current = true;
  }, [settings]);

  // Minimal persistence
  React.useEffect(() => { setSettings(p => (p.otRaw === otRaw ? p : { ...p, otRaw })); }, [otRaw]);
  React.useEffect(() => { setSettings(p => (p.ztRaw === ztRaw ? p : { ...p, ztRaw })); }, [ztRaw]);
  React.useEffect(() => { setSettings(p => (p.keysPerOTMode === keysPerOTMode ? p : { ...p, keysPerOTMode })); }, [keysPerOTMode]);

  // Bracket validity post parse-change
  React.useEffect(() => {
    setBracketWarning(null);
    setBracketedIndices(prev => {
      if (!prev.length) return prev;
      const max = ztTokens.length;
      const filtered = prev.filter(i => i >= 0 && i < max);
      if (filtered.length !== prev.length) setBracketWarning('Some deception brackets no longer exist after parse change — removed.');
      return filtered;
    });
  }, [ztTokens.length]);

  // Status update after analysis w.r.t. brackets
  React.useEffect(() => {
    const OT = otChars.length;
    if (OT === 0 || ztTokens.length === 0) { setKlamacStatus('none'); setStatusMessage(null); return; }
    if (!analysisDone) return;
    const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const effChars = effectiveZtTokens.length;
    const effGroups = Math.floor(effChars / groupSize);
    const leftover = effChars % groupSize;
    if (leftover !== 0) {
      setKlamacStatus('invalid');
      setStatusMessage(`Deception incorrectly selected: incomplete groups (missing ${groupSize - leftover} characters).`);
      return;
    }
    if (effGroups < OT) { setKlamacStatus('invalid'); setStatusMessage(`Wrong deception selected: OT (${OT}) > ZT (${effGroups}).`); }
    else if (effGroups > OT) { setKlamacStatus('needsKlamac'); setStatusMessage(`Excess groups: ${effGroups - OT}. Choose another deception token.`); }
    else { setKlamacStatus('ok'); setStatusMessage(null); }
  }, [analysisDone, bracketedIndices, effectiveZtTokens.length, otChars.length, ztTokens.length, ztParseMode, fixedLength]);

  function runAnalysis() {
    // Build logical tokens (group substrings) for analysis when in fixedLength mode
    const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const logicalTokens = buildLogicalTokens(ztTokens, groupSize);
    const alloc = computeRowAlloc(otRows as OTChar[][], logicalTokens); // proportional allocation based on logical groups
    const baseCounts = alloc.groups.map(r => r.map(v => v));
    const res = analyze(otRows as OTChar[][], logicalTokens, baseCounts, { keysPerOTMode }, lockedKeys);
    const sorted: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(res.candidatesByChar)) sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
    setCandidatesByChar(sorted);
    setSelections({});
    setAnalysisDone(true);
  }

  // Preserve existing selections where the token still appears in refreshed candidates
  function refreshAnalysisPreserve() {
    const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const logicalTokens = buildLogicalTokens(ztTokens, groupSize);
    const alloc = computeRowAlloc(otRows as OTChar[][], logicalTokens);
    const baseCounts = alloc.groups.map(r => r.map(v => v));
    const res = analyze(otRows as OTChar[][], logicalTokens, baseCounts, { keysPerOTMode }, lockedKeys);
    const sorted: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(res.candidatesByChar)) sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
    setCandidatesByChar(sorted);
    setSelections(prev => {
      const next: SelectionMap = {};
      for (const [ch, sel] of Object.entries(prev)) {
        const list = sorted[ch];
        if (list && list.some(c => c.token === sel)) next[ch] = sel;
      }
      return next;
    });
  }

  function onLockOT(ot: string, val: string) { setLockedKeys(prev => ({ ...prev, [ot]: val })); }
  function onUnlockOT(ot: string) { setLockedKeys(prev => { const c = { ...prev }; delete c[ot]; return c; }); }
  // drag behavior intentionally disabled in simplified mode

  function toggleBracketGroupByText(text: string) {
    if (!text) return;
    if (ztParseMode === 'fixedLength' && (fixedLength || 1) > 1) {
      setBracketedIndices(prev => toggleBracketByGroupText(text, ztTokens, fixedLength || 1, prev));
      return;
    }
    const same = ztTokens.map((t, i) => t.text === text ? i : -1).filter(i => i >= 0);
    setBracketedIndices(prev => {
      const set = new Set(prev);
      const all = same.every(i => set.has(i));
      if (all) same.forEach(i => set.delete(i)); else same.forEach(i => set.add(i));
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  const uniqueZTTokenTexts = useMemo(() => {
    if (ztParseMode === 'fixedLength' && (fixedLength || 1) > 1) {
      return uniqueGroupTexts(ztTokens, fixedLength || 1, bracketedIndices);
    }
    const seen = new Set<string>();
    const br = new Set(bracketedIndices);
    const map = new Map<string, number[]>();
    ztTokens.forEach((t, i) => { (map.get(t.text) || map.set(t.text, []).get(t.text))?.push(i); });
    const out: { text: string; allBracketed: boolean }[] = [];
    for (const t of ztTokens) {
      if (seen.has(t.text)) continue; seen.add(t.text);
      const idxs = map.get(t.text) || [];
      out.push({ text: t.text, allBracketed: idxs.length > 0 && idxs.every(i => br.has(i)) });
    }
    return out;
  }, [ztTokens, bracketedIndices, ztParseMode, fixedLength]);

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
    previewSelection();
    if (selectionError) return;
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
    if (analysisDone) refreshAnalysisPreserve();
  }, [customOtGroups, otRows, analysisDone]);

  // Insert raw characters after the group belonging to flat OT position (only fixedLength mode)
  function insertRawCharsAfterPosition(positionIndex: number, text: string) {
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
    // Insert at afterIndex (bounded to array length)
    const safeIndex = Math.min(afterIndex, rawArr.length);
    rawArr.splice(safeIndex, 0, ...chars);
    // Update fixed-length raw only (do not touch separator raw)
    setZtRawForMode('fixedLength', rawArr.join(''));
    if (analysisDone) setPendingAutoRefresh(true);
  }

  // Auto refresh analysis after raw edits/insertions when analysis already computed
  React.useEffect(() => {
    if (pendingAutoRefresh && analysisDone) {
      refreshAnalysisPreserve();
      setPendingAutoRefresh(false);
    }
  }, [pendingAutoRefresh, analysisDone, ztTokens, fixedLength, ztParseMode]);

  return {
    // inputs
    otRaw, setOtRaw,
    ztRaw, setZtRaw: setZtRawActive,
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
    joinOTAt,
    splitOTAt,
    // highlighting
    highlightedOTChar,
    toggleHighlightForOT,
  } as const;
}
