import React, { useMemo, useRef, useState } from 'react';
import type { KeysPerOTMode } from '../components/types';
import type { OTChar, ZTToken } from '../types/domain';
import { useLocalSettings } from './useLocalSettings';
import { analyze, type Candidate, type SelectionMap } from '../utils/analyzer';
import { computeRowAlloc } from '../utils/allocation';
import { convertCountsToLists, getCounts, reflowRowGroups, buildSingleTokenGroups, getExpectedZTIndicesForOT } from '../utils/grouping';
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

  // Locks, selections, status
  const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [candidatesByChar, setCandidatesByChar] = useState<Record<string, Candidate[]>>({});
  const [klamacStatus, setKlamacStatus] = useState<'none' | 'needsKlamac' | 'ok' | 'invalid'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // Bracketing
  const [bracketedIndices, setBracketedIndices] = useState<number[]>([]);
  const [bracketWarning, setBracketWarning] = useState<string | null>(null);

  // Groups
  const [analysisRowGroups, setAnalysisRowGroups] = useState<number[][][]>([]);
  const [displayRowGroups, setDisplayRowGroups] = useState<number[][][]>([]);
  const [analysisDone, setAnalysisDone] = useState(false);

  // Derived
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
    if (ztParseMode === 'separator') {
      parts = s.split(separator).filter(Boolean);
    } else {
      parts = [];
      for (let i = 0; i < s.length; i += fixedLength) parts.push(s.slice(i, i + fixedLength));
    }
    // initial status before any bracket selection (analysis independent)
    if (parts.length === 0 || otChars.length === 0) {
      setKlamacStatus('none');
      setStatusMessage(null);
    } else if (parts.length > otChars.length) {
      setKlamacStatus('needsKlamac');
      setStatusMessage(`Pozor: OT má menej znakov (${otChars.length}) ako ZT tokenov (${parts.length}). Vyber klamáč.`);
    } else if (parts.length < otChars.length) {
      setKlamacStatus('invalid');
      setStatusMessage(`OT má viac znakov (${otChars.length}) ako ZT tokenov (${parts.length}). Text môže byť poškodený alebo chybne parsovaný.`);
    } else {
      setKlamacStatus('ok');
      setStatusMessage(null);
    }
    return parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
  }, [ztRaw, ztParseMode, separator, fixedLength, otChars.length]);

  const effectiveZtTokens = useMemo(() => {
    if (!bracketedIndices || bracketedIndices.length === 0) return ztTokens;
    const brSet = new Set(bracketedIndices);
    return ztTokens.filter((_, i) => !brSet.has(i));
  }, [ztTokens, bracketedIndices]);

  const COLS = 12;
  const otRows = useMemo(() => {
    const rows: { id: string; ch: string }[][] = [];
    for (let i = 0; i < otChars.length; i += COLS) rows.push(otChars.slice(i, i + COLS));
    return rows.length ? rows : [[]];
  }, [otChars]);

  const baselineGroups = useMemo(() => {
    const { groups } = computeRowAlloc(otRows, ztTokens);
    return groups;
  }, [otRows, ztTokens]);

  // Auto-select top score=1 if fits expected indices
  React.useEffect(() => {
    if (!candidatesByChar || Object.keys(candidatesByChar).length === 0) return;
    const expectedIndices = getExpectedZTIndicesForOT(otRows, ztTokens, bracketedIndices);
    setSelections(prev => {
      const auto: SelectionMap = { ...prev };
      for (const [ch, list] of Object.entries(candidatesByChar)) {
        if (auto[ch]) continue;
        const score1 = list.filter(c => c.score === 1);
        if (score1.length !== 1) continue;
        const token = score1[0].token;
        const indices = ztTokens.map((t, i) => t.text === token ? i : -1).filter(i => i >= 0);
        const expected = expectedIndices[ch] || [];
        if (indices.length === expected.length && indices.every((v, i) => v === expected[i])) {
          auto[ch] = token;
        }
      }
      return auto;
    });
  }, [candidatesByChar, otRows, ztTokens, bracketedIndices]);

  // Hydration from local settings
  React.useEffect(() => {
    if (!hydrated.current) {
      setOtRaw(settings.otRaw ?? '');
      setZtRaw(settings.ztRaw ?? '');
      setKeysPerOTMode((settings.keysPerOTMode as KeysPerOTMode) ?? 'single');
      setLockedKeys(settings.lockedKeys ?? {});
      setBracketedIndices(Array.isArray(settings.bracketedIndices) ? settings.bracketedIndices : []);
      hydrated.current = true;
    }
  }, [settings]);

  // Persistence
  React.useEffect(() => { setSettings(prev => (prev.otRaw === otRaw ? prev : { ...prev, otRaw })); }, [otRaw, setSettings]);
  React.useEffect(() => { setSettings(prev => (prev.ztRaw === ztRaw ? prev : { ...prev, ztRaw })); }, [ztRaw, setSettings]);
  React.useEffect(() => { setSettings(prev => (prev.keysPerOTMode === keysPerOTMode ? prev : { ...prev, keysPerOTMode })); }, [keysPerOTMode, setSettings]);
  React.useEffect(() => {
    setSettings(prev => {
      const prevStr = JSON.stringify(prev.lockedKeys || {});
      const nextStr = JSON.stringify(lockedKeys || {});
      return prevStr === nextStr ? prev : { ...prev, lockedKeys };
    });
  }, [lockedKeys, setSettings]);
  React.useEffect(() => {
    setSettings(prev => {
      const prevStr = JSON.stringify(prev.bracketedIndices || []);
      const nextStr = JSON.stringify(bracketedIndices || []);
      return prevStr === nextStr ? prev : { ...prev, bracketedIndices };
    });
  }, [bracketedIndices, setSettings]);

  // Validate bracketed after parse changes
  React.useEffect(() => {
    setBracketWarning(null);
    setBracketedIndices(prev => {
      if (!prev || prev.length === 0) return prev;
      const max = ztTokens.length;
      const filtered = prev.filter(i => i >= 0 && i < max);
      if (filtered.length !== prev.length) {
        setBracketWarning('Niektoré klamače už neexistujú po zmene parsovania; boli odstránené.');
      }
      return filtered;
    });
  }, [ztTokens.length]);

  // Initialize analysis groups when OT/ZT change
  React.useEffect(() => {
    const baseLists = convertCountsToLists(baselineGroups);
    setAnalysisRowGroups(baseLists);
    const baseCounts = getCounts(baseLists);
    const effSel: SelectionMap = {};
    for (const [lk, seq] of Object.entries(lockedKeys)) if (seq) effSel[lk] = seq;
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) effSel[ch] = seq;
    const effCounts = reflowRowGroups(otRows as OTChar[][], effectiveZtTokens, baseCounts, effSel, candidatesByChar);
    setDisplayRowGroups(convertCountsToLists(effCounts));
  }, [baselineGroups, otRows, ztTokens]);

  // On bracket changes after analysis
  React.useEffect(() => {
    if (!analysisDone) return;
    const baseCounts = getCounts(analysisRowGroups.length ? analysisRowGroups : convertCountsToLists(baselineGroups));
    const effSel: SelectionMap = {};
    for (const [lk, seq] of Object.entries(lockedKeys)) if (seq) effSel[lk] = seq;
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) effSel[ch] = seq;
    const effCounts = reflowRowGroups(otRows as OTChar[][], effectiveZtTokens, baseCounts, effSel, candidatesByChar);
    setDisplayRowGroups(convertCountsToLists(effCounts));
  }, [bracketedIndices, effectiveZtTokens, analysisDone]);

  // Reflow display when locks or selections change
  React.useEffect(() => {
    if (!analysisDone) return;
    const baseCounts = getCounts(analysisRowGroups.length ? analysisRowGroups : convertCountsToLists(baselineGroups));
    const effSel: SelectionMap = {};
    for (const [lk, seq] of Object.entries(lockedKeys)) if (seq) effSel[lk] = seq;
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) effSel[ch] = seq;
    const effCounts = reflowRowGroups(otRows as OTChar[][], effectiveZtTokens, baseCounts, effSel, candidatesByChar);
    setDisplayRowGroups(convertCountsToLists(effCounts));
  }, [lockedKeys, selections, candidatesByChar, analysisRowGroups, effectiveZtTokens, otRows, analysisDone]);

  // Status update after analysis based on effective lens
  React.useEffect(() => {
    const OT = otChars.length;
    const totalZT = ztTokens.length;
    const effLen = effectiveZtTokens.length;
    if (OT === 0 || totalZT === 0) {
      setKlamacStatus('none');
      setStatusMessage(null);
      return;
    }
    if (!analysisDone) return;
    if (effLen < OT) {
      setKlamacStatus('invalid');
      setStatusMessage(`Vybraný zlý klamáč alebo text je poškodený: OT (${OT}) > ZT po odfiltrovaní (${effLen}).`);
    } else if (effLen > OT) {
      setKlamacStatus('needsKlamac');
      setStatusMessage(`Ešte stále je viac ZT tokenov (${effLen}) ako OT znakov (${OT}). Vyber ďalší klamáč.`);
    } else {
      setKlamacStatus('ok');
      setStatusMessage(null);
    }
  }, [analysisDone, bracketedIndices, effectiveZtTokens.length, otChars.length, ztTokens.length]);

  function runAnalysis() {
    const rg = (analysisRowGroups.length > 0 ? analysisRowGroups : convertCountsToLists(baselineGroups)) as number[][][];
    const base = getCounts(rg);
    const res = analyze(otRows as OTChar[][], ztTokens, base, { keysPerOTMode }, lockedKeys);
    const analyzed = convertCountsToLists(res.proposedRowGroups);
    setAnalysisRowGroups(analyzed);
    setDisplayRowGroups(analyzed);
    setCandidatesByChar(res.candidatesByChar);
    setSelections({});
    setAnalysisDone(true);
  }

  function onLockOT(ot: string, lockValue: string) { setLockedKeys(prev => ({ ...prev, [ot]: lockValue })); }
  function onUnlockOT(ot: string) {
    setLockedKeys(prev => { const copy = { ...prev }; delete copy[ot]; return copy; });
  }

  function mutateDisplayGroups(srcRow: number, srcCol: number, newSrc: number[], dstRow: number, dstCol: number, newDst: number[]) {
    setDisplayRowGroups(prev => {
      const copy = prev.map(row => row.map(cell => [...cell]));
      if (copy[srcRow] && copy[srcRow][srcCol]) copy[srcRow][srcCol] = newSrc;
      if (copy[dstRow] && copy[dstRow][dstCol]) copy[dstRow][dstCol] = newDst;
      return copy;
    });
  }

  function onDragEnd(evt: DragEndEvent) {
    const data = evt.active?.data?.current as { type?: string; tokenIndex?: number; row?: number; col?: number } | undefined;
    const overId = evt.over?.id;
    if (!data || data.type !== 'zt' || typeof data.tokenIndex !== 'number') return;
    if (typeof overId === 'string' && overId.startsWith('cell-') && data.row != null && data.col != null) {
      const match = /cell-(\d+)-(\d+)/.exec(String(overId));
      if (!match) return;
      const dstRow = parseInt(match[1], 10);
      const dstCol = parseInt(match[2], 10);
      const srcRow = data.row;
      const srcCol = data.col;
      if (srcRow === dstRow && srcCol === dstCol) return;
      const srcCh = (otRows as OTChar[][])[srcRow]?.[srcCol]?.ch;
      const dstCh = (otRows as OTChar[][])[dstRow]?.[dstCol]?.ch;
      if ((srcCh && lockedKeys[srcCh]) || (dstCh && lockedKeys[dstCh])) return;
      const coords: { row: number; col: number }[] = [];
      for (let r = 0; r < displayRowGroups.length; r++) for (let c = 0; c < displayRowGroups[r].length; c++) coords.push({ row: r, col: c });
      const idxOf = (row: number, col: number) => coords.findIndex(k => k.row === row && k.col === col);
      const srcFlat = idxOf(srcRow, srcCol);
      const dstFlat = idxOf(dstRow, dstCol);
      if (srcFlat < 0 || dstFlat < 0) return;
      if (Math.abs(srcFlat - dstFlat) !== 1) return;
      const direction = dstFlat < srcFlat ? 'left' : 'right';
      const srcList = displayRowGroups[srcRow]?.[srcCol];
      const dstList = displayRowGroups[dstRow]?.[dstCol];
      if (!srcList || !dstList) return;
      if (srcList.length === 0) return;
      const tokenIdx = data.tokenIndex;
      if (direction === 'left') {
        if (srcList[0] !== tokenIdx) return;
        const moving = srcList[0];
        const newSrc = srcList.slice(1);
        const newDst = [...dstList, moving];
        mutateDisplayGroups(srcRow, srcCol, newSrc, dstRow, dstCol, newDst);
      } else {
        if (srcList[srcList.length - 1] !== tokenIdx) return;
        const moving = srcList[srcList.length - 1];
        const newSrc = srcList.slice(0, -1);
        const newDst = [moving, ...dstList];
        mutateDisplayGroups(srcRow, srcCol, newSrc, dstRow, dstCol, newDst);
      }
    }
  }

  function toggleBracketGroupByText(text: string) {
    if (!text) return;
    const sameTextIdx = ztTokens.map((t, idx) => (t.text === text ? idx : -1)).filter(idx => idx >= 0);
    setBracketedIndices(prev => {
      const set = new Set(prev);
      const allAreBracketed = sameTextIdx.length > 0 && sameTextIdx.every(idx => set.has(idx));
      if (allAreBracketed) for (const idx of sameTextIdx) set.delete(idx);
      else for (const idx of sameTextIdx) set.add(idx);
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  const uniqueZTTokenTexts = useMemo(() => {
    const seen = new Set<string>();
    const brSet = new Set(bracketedIndices);
    const map = new Map<string, number[]>();
    ztTokens.forEach((t, i) => { if (!map.has(t.text)) map.set(t.text, []); map.get(t.text)!.push(i); });
    const arr: { text: string; allBracketed: boolean }[] = [];
    for (const t of ztTokens) {
      if (seen.has(t.text)) continue;
      seen.add(t.text);
      const idxs = map.get(t.text) || [];
      const allBracketed = idxs.length > 0 && idxs.every(i => brSet.has(i));
      arr.push({ text: t.text, allBracketed });
    }
    return arr;
  }, [ztTokens, bracketedIndices]);

  function previewSelection() {
    const forced: Record<string, string> = { ...lockedKeys };
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) forced[ch] = seq as string;
    const { groups, error } = buildSingleTokenGroups(otRows as OTChar[][], effectiveZtTokens, forced);
    const totalCells = (otRows as OTChar[][]).reduce((a, row) => a + row.filter(c => c.ch !== '').length, 0);
    let finalError = error;
    if (!finalError && bracketedIndices.length === 0 && effectiveZtTokens.length > totalCells) {
      const diff = effectiveZtTokens.length - totalCells;
      finalError = `Pozor stále je prítomný klamač:   ZT tokenov je o ${diff} viac ako OT znakov.`;
    }
    setSelectionError(finalError);
    setDisplayRowGroups(groups);
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
    bracketWarning, setBracketWarning,
    analysisDone,
    selectionError,
    // derived
    otChars, ztTokens, effectiveZtTokens,
    otRows, baselineGroups,
    analysisRowGroups, displayRowGroups,
    uniqueZTTokenTexts, reservedTokens,
    // actions
    runAnalysis,
    onLockOT, onUnlockOT,
    onDragEnd,
    toggleBracketGroupByText,
    mutateDisplayGroups,
    previewSelection,
    applySelection,
    setCandidatesByChar, setDisplayRowGroups, setAnalysisRowGroups,
    setAnalysisDone, setSelectionError,
  } as const;
}
