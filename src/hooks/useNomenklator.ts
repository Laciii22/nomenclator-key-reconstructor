import React, { useMemo, useRef, useState } from 'react';
import type { KeysPerOTMode } from '../components/types';
import type { OTChar, ZTToken } from '../types/domain';
import { useLocalSettings } from './useLocalSettings';
import { analyze, type Candidate, type SelectionMap } from '../utils/analyzer';
import { computeRowAlloc } from '../utils/allocation';
import { getExpectedZTIndicesForOT } from '../utils/grouping';
import { buildShiftOnlyColumns } from '../utils/shiftMapping';
import type { DragEndEvent } from '@dnd-kit/core';

export function useNomenklator() {
  const [settings, setSettings] = useLocalSettings({ keysPerOTMode: 'single' });
  const hydrated = useRef(false);

  // Inputs & modes
  const [otRaw, setOtRaw] = useState('');
  const [ztRaw, setZtRaw] = useState('');
  const [ztParseMode, setZtParseMode] = useState<'separator' | 'fixedLength'>('separator');
  const [separator, setSeparator] = useState<string>(':');
  const [fixedLength, setFixedLength] = useState<number>(1);
  const [keysPerOTMode, setKeysPerOTMode] = useState<KeysPerOTMode>('single');

  // Locks & selections
  const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [candidatesByChar, setCandidatesByChar] = useState<Record<string, Candidate[]>>({});
  const [analysisDone, setAnalysisDone] = useState(false);
  const [pendingAutoRefresh, setPendingAutoRefresh] = useState(false);

  // Status / warnings
  const [klamacStatus, setKlamacStatus] = useState<'none' | 'needsKlamac' | 'ok' | 'invalid'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [bracketWarning, setBracketWarning] = useState<string | null>(null);

  // Brackets
  const [bracketedIndices, setBracketedIndices] = useState<number[]>([]);

  // Derived sets
  const reservedTokens = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(lockedKeys)) if (v) set.add(v);
    for (const v of Object.values(selections)) if (v) set.add(v);
    return set;
  }, [lockedKeys, selections]);

  const otChars = useMemo(() => {
    const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
    return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [otRaw]);

  // Raw ZT tokens are always single characters in fixedLength mode (for easier editing)
  // In separator mode they are split by separator.
  const ztTokens = useMemo<ZTToken[]>(() => {
    const s = ztRaw.trim();
    let parts: string[] = [];
    if (!s) {
      setKlamacStatus('none');
      setStatusMessage(null);
      return [];
    }
    if (ztParseMode === 'separator') {
      parts = s.split(separator).filter(Boolean);
      // Status directly compares token count to OT chars
      if (parts.length === 0 || otChars.length === 0) { setKlamacStatus('none'); setStatusMessage(null); }
      else if (parts.length > otChars.length) { setKlamacStatus('needsKlamac'); setStatusMessage(`Pozor: OT (${otChars.length}) < ZT tokenov (${parts.length}). Vyber klamáč.`); }
      else if (parts.length < otChars.length) { setKlamacStatus('invalid'); setStatusMessage(`OT (${otChars.length}) > ZT tokenov (${parts.length}). Text môže byť poškodený.`); }
      else { setKlamacStatus('ok'); setStatusMessage(null); }
    } else {
      // fixedLength: break into single characters, but logical grouping uses fixedLength later
      parts = Array.from(s);
      const groupSize = fixedLength > 0 ? fixedLength : 1;
      const groupsCount = Math.floor(parts.length / groupSize);
      const leftover = parts.length % groupSize;
      if (groupsCount === 0 || otChars.length === 0) { setKlamacStatus('none'); setStatusMessage(null); }
      else if (leftover !== 0) {
        setKlamacStatus('invalid');
        setStatusMessage(`Nedokončená skupina: chýba ${groupSize - leftover} znak(y) pre poslednú skupinu.`);
      } else if (groupsCount > otChars.length) {
        setKlamacStatus('needsKlamac');
        setStatusMessage(`Pozor: OT (${otChars.length}) < skupín ZT (${groupsCount}). Vyber klamáč.`);
      } else if (groupsCount < otChars.length) {
        setKlamacStatus('invalid');
        setStatusMessage(`OT (${otChars.length}) > skupín ZT (${groupsCount}). Text môže byť poškodený.`);
      } else { setKlamacStatus('ok'); setStatusMessage(null); }
    }
    return parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
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
    setZtRaw(settings.ztRaw ?? '');
    setKeysPerOTMode((settings.keysPerOTMode as KeysPerOTMode) ?? 'single');
    setLockedKeys({});
    setBracketedIndices([]);
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
      if (filtered.length !== prev.length) setBracketWarning('Niektoré klamače po zmene parsovania neexistujú – odstránené.');
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
      setStatusMessage(`Klamač zle vybraný: nedelené skupiny (chýba ${groupSize - leftover}).`);
      return;
    }
    if (effGroups < OT) { setKlamacStatus('invalid'); setStatusMessage(`Vybraný zlý klamáč: OT (${OT}) > ZT (${effGroups}).`); }
    else if (effGroups > OT) { setKlamacStatus('needsKlamac'); setStatusMessage(`Prebytočné skupiny: ${effGroups - OT}. Vyber ďalší klamáč.`); }
    else { setKlamacStatus('ok'); setStatusMessage(null); }
  }, [analysisDone, bracketedIndices, effectiveZtTokens.length, otChars.length, ztTokens.length, ztParseMode, fixedLength]);

  function runAnalysis() {
    // Build logical tokens (group substrings) for analysis when in fixedLength mode
    const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    let logicalTokens: ZTToken[];
    if (groupSize === 1) {
      logicalTokens = ztTokens;
    } else {
      logicalTokens = [];
      for (let i = 0; i + groupSize - 1 < ztTokens.length; i += groupSize) {
        const slice = ztTokens.slice(i, i + groupSize).map(t => t.text).join('');
        logicalTokens.push({ id: `lzt_${i}`, text: slice });
      }
    }
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
    let logicalTokens: ZTToken[];
    if (groupSize === 1) {
      logicalTokens = ztTokens;
    } else {
      logicalTokens = [];
      for (let i = 0; i + groupSize - 1 < ztTokens.length; i += groupSize) {
        const slice = ztTokens.slice(i, i + groupSize).map(t => t.text).join('');
        logicalTokens.push({ id: `lzt_${i}`, text: slice });
      }
    }
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
  function onDragEnd(_evt: DragEndEvent) { /* drag disabled in simplified mode */ }

  function toggleBracketGroupByText(text: string) {
    if (!text) return;
    const same = ztTokens.map((t, i) => t.text === text ? i : -1).filter(i => i >= 0);
    setBracketedIndices(prev => {
      const set = new Set(prev);
      const all = same.every(i => set.has(i));
      if (all) same.forEach(i => set.delete(i)); else same.forEach(i => set.add(i));
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  const uniqueZTTokenTexts = useMemo(() => {
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
  }, [ztTokens, bracketedIndices]);

  function previewSelection() {
    const totalCells = otRows.reduce((a, r) => a + r.filter(c => c.ch !== '').length, 0);
    let err: string | null = null;
    if (!bracketedIndices.length) {
      if (ztParseMode === 'fixedLength') {
        const groupSize = fixedLength || 1;
        const effGroups = Math.floor(effectiveZtTokens.length / groupSize);
        const leftover = effectiveZtTokens.length % groupSize;
        if (leftover !== 0) {
          err = `Nedokončená skupina: chýba ${groupSize - leftover} znak(y).`;
        } else if (effGroups > totalCells) {
          err = `Pozor klamáč: skupín ZT o ${effGroups - totalCells} viac.`;
        }
      } else {
        if (effectiveZtTokens.length > totalCells) err = `Pozor klamáč: ZT tokenov o ${effectiveZtTokens.length - totalCells} viac.`;
      }
    }
    setSelectionError(err);
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
    setZtRaw(newRaw);
    if (analysisDone) setPendingAutoRefresh(true);
  }

  function applySelection() {
    previewSelection();
    if (selectionError) return;
    const newLocks: Record<string, string> = {};
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) newLocks[ch] = seq as string;
    if (Object.keys(newLocks).length) setLockedKeys(prev => ({ ...prev, ...newLocks }));
  }

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
    // Update ztRaw (fixedLength mode raw is just concatenation)
    setZtRaw(rawArr.join(''));
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
    onDragEnd,
    toggleBracketGroupByText,
    previewSelection,
    applySelection,
    editZtToken,
    insertRawCharsAfterPosition,
    setCandidatesByChar, setAnalysisDone, setSelectionError,
  } as const;
}
