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

  const ztTokens = useMemo<ZTToken[]>(() => {
    const s = ztRaw.trim();
    let parts: string[];
    if (ztParseMode === 'separator') parts = s.split(separator).filter(Boolean);
    else {
      parts = [];
      for (let i = 0; i < s.length; i += fixedLength) parts.push(s.slice(i, i + fixedLength));
    }
    if (parts.length === 0 || otChars.length === 0) { setKlamacStatus('none'); setStatusMessage(null); }
    else if (parts.length > otChars.length) { setKlamacStatus('needsKlamac'); setStatusMessage(`Pozor: OT (${otChars.length}) < ZT tokenov (${parts.length}). Vyber klamáč.`); }
    else if (parts.length < otChars.length) { setKlamacStatus('invalid'); setStatusMessage(`OT (${otChars.length}) > ZT tokenov (${parts.length}). Text môže byť poškodený.`); }
    else { setKlamacStatus('ok'); setStatusMessage(null); }
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
  const columns = useMemo(() => buildShiftOnlyColumns(otRows, effectiveZtTokens, lockedKeys, selections), [otRows, effectiveZtTokens, lockedKeys, selections]);

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
    const eff = effectiveZtTokens.length;
    if (OT === 0 || ztTokens.length === 0) { setKlamacStatus('none'); setStatusMessage(null); return; }
    if (!analysisDone) return;
    if (eff < OT) { setKlamacStatus('invalid'); setStatusMessage(`Vybraný zlý klamáč: OT (${OT}) > ZT (${eff}).`); }
    else if (eff > OT) { setKlamacStatus('needsKlamac'); setStatusMessage(`Prebytočné tokeny: ${eff - OT}. Vyber ďalší klamáč.`); }
    else { setKlamacStatus('ok'); setStatusMessage(null); }
  }, [analysisDone, bracketedIndices, effectiveZtTokens.length, otChars.length, ztTokens.length]);

  function runAnalysis() {
    const alloc = computeRowAlloc(otRows as OTChar[][], ztTokens); // still used for basic counts heuristic
    const baseCounts = alloc.groups.map(r => r.map(v => v));
    const res = analyze(otRows as OTChar[][], ztTokens, baseCounts, { keysPerOTMode }, lockedKeys);
    const sorted: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(res.candidatesByChar)) sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
    setCandidatesByChar(sorted);
    setSelections({});
    setAnalysisDone(true);
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
    if (!bracketedIndices.length && effectiveZtTokens.length > totalCells) err = `Pozor klamáč: ZT tokenov o ${effectiveZtTokens.length - totalCells} viac.`;
    setSelectionError(err);
  }

  function editZtToken(effIndex: number, newText: string) {
    const br = new Set(bracketedIndices);
    const effToOrig: number[] = [];
    for (let i = 0; i < ztTokens.length; i++) if (!br.has(i)) effToOrig.push(i);
    const orig = effToOrig[effIndex] ?? effIndex;
    if (orig < 0 || orig >= ztTokens.length) return;
    const tokens = ztTokens.map(t => t.text);
    tokens[orig] = newText;
    const newRaw = ztParseMode === 'separator' ? tokens.join(separator) : tokens.join('');
    setZtRaw(newRaw);
  }

  function applySelection() {
    previewSelection();
    if (selectionError) return;
    const newLocks: Record<string, string> = {};
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) newLocks[ch] = seq as string;
    if (Object.keys(newLocks).length) setLockedKeys(prev => ({ ...prev, ...newLocks }));
  }

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
    setCandidatesByChar, setAnalysisDone, setSelectionError,
  } as const;
}
