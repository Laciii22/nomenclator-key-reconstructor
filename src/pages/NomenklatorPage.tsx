import React, { useMemo, useRef, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import type { KeysPerOTMode } from '../components/types';
import type { OTChar, ZTToken } from '../types/domain';
import { analyze, type Candidate, type SelectionMap, locksFromSelections } from '../utils/analyzer';
import { computeRowAlloc } from '../utils/allocation';
import { useLocalSettings } from '../hooks/useLocalSettings';

const NomenklatorPage: React.FC = () => {
  const [settings, setSettings] = useLocalSettings({ keysPerOTMode: 'single' });
  const hydrated = useRef(false);
  const [otRaw, setOtRaw] = useState('');
  const [ztRaw, setZtRaw] = useState('');
  const [keysPerOTMode, setKeysPerOTMode] = useState<KeysPerOTMode>('single');
  const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});
  const [rowGroups, setRowGroups] = useState<number[][]>([]);
  
  const [validationMsg, setValidationMsg] = useState<string>('');
  const [candidatesByChar, setCandidatesByChar] = useState<Record<string, Candidate[]>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [showAllCandidates, setShowAllCandidates] = useState<boolean>(false);
  

  const otChars = useMemo(() => {
    const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
    return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [otRaw]);

  const ztTokens = useMemo(() => {
    const s = ztRaw.trim();
    const parts = /\s/.test(s) ? s.split(/\s+/).filter(Boolean) : Array.from(s);
    return parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
  }, [ztRaw]);

  const COLS = 12;
  const otRows = useMemo(() => {
    const rows: { id: string; ch: string }[][] = [];
    for (let i = 0; i < otChars.length; i += COLS) rows.push(otChars.slice(i, i + COLS));
    return rows.length ? rows : [[]];
  }, [otChars]);

  // Baseline allocation whenever OT/ZT changes
  const baselineGroups = useMemo(() => {
    const { groups } = computeRowAlloc(otRows, ztTokens);
    return groups;
  }, [otRows, ztTokens]);

  // Hydrate state from local settings once
  React.useEffect(() => {
    if (!hydrated.current) {
      setOtRaw(settings.otRaw ?? '');
      setZtRaw(settings.ztRaw ?? '');
      setKeysPerOTMode((settings.keysPerOTMode as KeysPerOTMode) ?? 'single');
      setLockedKeys(settings.lockedKeys ?? {});
      hydrated.current = true;
    }
  }, [settings]);

  // Persist to local settings when changed
  React.useEffect(() => {
    setSettings(prev => (prev.otRaw === otRaw ? prev : { ...prev, otRaw }));
  }, [otRaw, setSettings]);
  React.useEffect(() => {
    setSettings(prev => (prev.ztRaw === ztRaw ? prev : { ...prev, ztRaw }));
  }, [ztRaw, setSettings]);
  React.useEffect(() => {
    setSettings(prev => (prev.keysPerOTMode === keysPerOTMode ? prev : { ...prev, keysPerOTMode }));
  }, [keysPerOTMode, setSettings]);
  React.useEffect(() => {
    setSettings(prev => {
      const prevStr = JSON.stringify(prev.lockedKeys || {});
      const nextStr = JSON.stringify(lockedKeys || {});
      return prevStr === nextStr ? prev : { ...prev, lockedKeys };
    });
  }, [lockedKeys, setSettings]);

  // Initialize rowGroups from baseline on first render or when inputs change
  React.useEffect(() => {
    setRowGroups(baselineGroups);
    setLockedKeys({});
    setCandidatesByChar({});
    setSelections({});
    
    setValidationMsg('');
  }, [baselineGroups]);

  function runAnalysis() {
    // Pass current locks so analyzer first honors them when computing starts/candidates
    const res = analyze(otRows, ztTokens, rowGroups.length ? rowGroups : baselineGroups, { keysPerOTMode }, lockedKeys);
    // Populate candidates and default selections (only high-confidence pre-selected)
    setCandidatesByChar(res.candidatesByChar);
    const nextSel: SelectionMap = {};
    for (const s of res.suggestions) {
      if (s.lockRecommended) nextSel[s.otChar] = s.token;
    }
    setSelections(nextSel);
  }

  function onLockOT(ot: string, lockValue: string) {
    setLockedKeys(prev => ({ ...prev, [ot]: lockValue }));
  }
  function onUnlockOT(ot: string) {
    setLockedKeys(prev => {
      const copy = { ...prev };
      delete copy[ot];
      return copy;
    });
  }

  // Helpers: flatten OT (non-empty) and compute flat group strings for given groups
  function flattenOTChars(rows: OTChar[][]) {
    const flat: OTChar[] = [];
    for (const r of rows) for (const cell of r) if (cell && cell.ch !== '') flat.push(cell);
    return flat;
  }
  function flatGroupsFor(rows: OTChar[][], tokens: ZTToken[], groups: number[][]) {
    const totalZT = tokens.length;
    const cursor = { i: 0 };
    const out: string[] = [];
    for (let r = 0; r < rows.length; r++) {
      const otRow = rows[r].filter(c => c.ch !== '');
      const sizes = (groups[r] || []).slice(0, otRow.length);
      while (sizes.length < otRow.length) sizes.push(0);
      for (let c = 0; c < otRow.length; c++) {
        const take = Math.max(0, Math.min(totalZT - cursor.i, sizes[c]));
        const group = tokens.slice(cursor.i, cursor.i + take);
        cursor.i += take;
        out.push(group.map(z => z.text).join(''));
      }
    }
    return out;
  }

  // Auto-reflow: tries to align selected chars to their chosen sequences by shifting
  // extra tokens into previous non-selected cells, while preserving total token count.
  function reflowRowGroups(
    rows: OTChar[][],
    tokens: ZTToken[],
    base: number[][],
    selectionsIn: SelectionMap,
    cands: Record<string, Candidate[]>
  ): number[][] {
    // Flatten OT and base counts
    const flat: OTChar[] = [];
    const rowLens: number[] = [];
    for (let r = 0; r < rows.length; r++) {
      const otRow = rows[r].filter(c => c.ch !== '');
      rowLens.push(otRow.length);
      for (const cell of otRow) flat.push(cell);
    }
    const counts: number[] = [];
    for (let r = 0; r < base.length; r++) {
      const len = rowLens[r] || 0;
      const sizes = (base[r] || []).slice(0, len);
      while (sizes.length < len) sizes.push(0);
      counts.push(...sizes);
    }
    const totalZT = tokens.length;
    const T = counts.reduce((a, b) => a + b, 0);
    const isSelectedIndex = (i: number) => Boolean(selectionsIn[flat[i]?.ch]);
    const seqLenFor = (ch: string, seq: string) => {
      const found = (cands[ch] || []).find(c => c.token === seq);
      return found ? found.length : seq.length;
    };
    const matchAt = (start: number, seq: string) => {
      if (start < 0 || start + seq.length > totalZT) return false;
      for (let i = 0; i < seq.length; i++) if (tokens[start + i].text !== seq[i]) return false;
      return true;
    };
    // Greedy left-to-right alignment
    let cursor = 0;
    for (let i = 0; i < counts.length; i++) {
      const ch = flat[i]?.ch;
      const want = ch ? selectionsIn[ch] : null;
      if (!want) { cursor += counts[i] || 0; continue; }
      const L = seqLenFor(ch!, want!);
      // Find all possible starts for want and choose the closest to current cursor.
      const positions: number[] = [];
      for (let p = 0; p + want!.length <= totalZT; p++) if (matchAt(p, want!)) positions.push(p);
      let target = -1;
      if (positions.length > 0) {
        // Prefer minimal absolute shift; if tie, prefer backward when feasible (to avoid stealing later matches)
        let bestAbs = Number.POSITIVE_INFINITY;
        let bestIdx = -1;
        for (let idx = 0; idx < positions.length; idx++) {
          const p = positions[idx];
          const abs = Math.abs(p - cursor);
          if (abs < bestAbs) { bestAbs = abs; bestIdx = idx; }
          else if (abs === bestAbs) {
            // Tie-breaker: prefer p <= cursor (backward) to keep later runs for later cells
            if (p <= cursor && (bestIdx < 0 || positions[bestIdx] > cursor)) bestIdx = idx;
          }
        }
        target = positions[bestIdx];
      }
      if (target >= 0) {
        const delta = target - cursor;
        const prevIdx: number[] = [];
        for (let j = i - 1; j >= 0; j--) if (!isSelectedIndex(j)) prevIdx.push(j);
        if (delta > 0) {
          // Move start forward by increasing previous non-selected counts
          let need = delta;
          let p = 0;
          while (need > 0 && prevIdx.length > 0) {
            const j = prevIdx[p];
            counts[j] = (counts[j] || 0) + 1;
            need -= 1;
            if (prevIdx.length > 1) p = (p + 1) % prevIdx.length;
          }
          if (need > 0 && prevIdx.length > 0) {
            counts[prevIdx[0]] = (counts[prevIdx[0]] || 0) + need;
          }
        } else if (delta < 0) {
          // Move start backward by decreasing previous non-selected counts if possible
          let need = -delta;
          for (let j = 0; j < prevIdx.length && need > 0; j++) {
            const idx = prevIdx[j];
            const take = Math.min(counts[idx] || 0, need);
            if (take > 0) {
              counts[idx] = (counts[idx] || 0) - take;
              need -= take;
            }
          }
          // If we could not pull back enough, fall back to nearest forward match (>= cursor)
          if (need > 0) {
            const fwd = positions.find(p => p >= cursor);
            if (typeof fwd === 'number') {
              const forwardDelta = fwd - cursor;
              let need2 = forwardDelta;
              let p2 = 0;
              while (need2 > 0 && prevIdx.length > 0) {
                const j = prevIdx[p2];
                counts[j] = (counts[j] || 0) + 1;
                need2 -= 1;
                if (prevIdx.length > 1) p2 = (p2 + 1) % prevIdx.length;
              }
              if (need2 > 0 && prevIdx.length > 0) counts[prevIdx[0]] = (counts[prevIdx[0]] || 0) + need2;
              target = fwd;
            }
          }
        }
        counts[i] = L;
        cursor = target + L;
      } else {
        counts[i] = L;
        cursor += counts[i];
      }
    }
    // Preserve total tokens by trimming/padding tail non-selected cells
    const sumNow = counts.reduce((a, b) => a + b, 0);
    if (sumNow > T) {
      let need = sumNow - T;
      for (let i = counts.length - 1; i >= 0 && need > 0; i--) {
        if (isSelectedIndex(i)) continue;
        const can = Math.min(counts[i], need);
        counts[i] -= can;
        need -= can;
      }
    } else if (sumNow < T) {
      let need = T - sumNow;
      for (let i = counts.length - 1; i >= 0 && need > 0; i--) {
        if (isSelectedIndex(i)) continue;
        counts[i] += 1;
        need -= 1;
      }
    }
    // Rebuild 2D groups
    const groups: number[][] = [];
    let k = 0;
    for (let r = 0; r < rowLens.length; r++) {
      const len = rowLens[r] || 0;
      const row: number[] = [];
      for (let c = 0; c < len; c++) row.push(Math.max(0, counts[k++] || 0));
      groups.push(row);
    }
    return groups;
  }

  // Validate a set of selections: budget check and alignment check after previewing
  function validateSelections(
    selectionsIn: SelectionMap,
    candidates: Record<string, Candidate[]>,
    base: number[][]
  ): { ok: boolean; message: string; preview: number[][] } {
    // Early budget check
    const flat = flattenOTChars(otRows);
    const occ: Record<string, number> = {};
    for (const ch of flat.map(c => c.ch)) occ[ch] = (occ[ch] || 0) + 1;
    let required = 0;
    for (const [ch, seq] of Object.entries(selectionsIn)) {
      if (!seq) continue;
      const len = (candidates[ch] || []).find(c => c.token === seq)?.length ?? seq.length;
      required += (occ[ch] || 0) * len;
    }
    if (required > ztTokens.length) {
      return { ok: false, message: `Výber vyžaduje ${required} tokenov, ale k dispozícii je len ${ztTokens.length}.`, preview: base };
    }
    // Build preview (auto-reflow) and verify exact alignment per occurrence
  const preview = reflowRowGroups(otRows, ztTokens, base, selectionsIn, candidates);
  const flatGroups = flatGroupsFor(otRows, ztTokens, preview);
    let mismatches = 0;
    const occIndex: Record<string, number> = {};
    const bad: string[] = [];
    for (let i = 0; i < flat.length; i++) {
      const ch = flat[i].ch;
      occIndex[ch] = (occIndex[ch] || 0) + 1;
      const want = selectionsIn[ch] || null;
      if (!want) continue;
      if (flatGroups[i] !== want) {
        mismatches++;
        if (bad.length < 10) {
          bad.push(`${ch}[${occIndex[ch]}]`);
        }
      }
    }
    if (mismatches > 0) {
      const tail = bad.length === mismatches ? bad.join(', ') : `${bad.join(', ')}…`;
      return { ok: false, message: `Zarovnanie nezodpovedá výberu: ${mismatches} buniek sa líši. Problémové: ${tail}`, preview };
    }
    return { ok: true, message: '', preview };
  }

  // Memoized occurrences of each OT char (non-empty cells only)
  const occurrencesByChar = useMemo(() => {
    const flat: { id: string; ch: string }[] = [];
    for (const r of otRows) for (const cell of r) if (cell && cell.ch !== '') flat.push(cell);
    const occ: Record<string, number> = {};
    for (const ch of flat.map(c => c.ch)) occ[ch] = (occ[ch] || 0) + 1;
    return occ;
  }, [otRows]);

  // Helper to get length of a sequence for a given char from candidates or string length fallback
  function seqLengthFor(ch: string, seq: string | null | undefined, cands: Record<string, Candidate[]>) {
    if (!seq) return 0;
    const found = (cands[ch] || []).find(c => c.token === seq);
    return found ? found.length : seq.length;
  }

  // Move one ZT token to a target cell by adjusting allocation counts (rowGroups),
  // while preserving total tokens and respecting simple lock constraints.
  function onMoveZTTokenHandler(tokenIndex: number, toRow: number, toCol: number) {
    // Build flat OT cell list (non-empty) and row lengths
    const flat: OTChar[] = [];
    const rowLens: number[] = [];
    for (let r = 0; r < otRows.length; r++) {
      const row = otRows[r].filter(c => c.ch !== '');
      rowLens.push(row.length);
      for (const cell of row) flat.push(cell);
    }
    if (flat.length === 0) return;
    const base = rowGroups.length ? rowGroups : baselineGroups;
    // Flatten counts aligned to flat cells
    const counts: number[] = [];
    for (let r = 0; r < base.length; r++) {
      const len = rowLens[r] || 0;
      const sizes = (base[r] || []).slice(0, len);
      while (sizes.length < len) sizes.push(0);
      counts.push(...sizes);
    }
    const totalZT = ztTokens.length;
    // Compute start indices per flat cell to locate source cell containing tokenIndex
    const starts: number[] = [];
    let cursor = 0;
    for (let i = 0; i < counts.length; i++) { starts[i] = cursor; cursor += Math.max(0, counts[i] || 0); }
    if (tokenIndex < 0 || tokenIndex >= totalZT) return;
    let srcIdx = -1;
    for (let i = 0; i < counts.length; i++) {
      const s = starts[i];
      const e = s + (counts[i] || 0);
      if (tokenIndex >= s && tokenIndex < e) { srcIdx = i; break; }
    }
    if (srcIdx < 0) return; // token not inside any allocated cell (shouldn't happen)
    // Compute target flat index from toRow/toCol in filtered rows
    let tgtIdx = -1;
    if (toRow >= 0 && toRow < rowLens.length) {
      if (toCol >= 0 && toCol < rowLens[toRow]) {
        tgtIdx = rowLens.slice(0, toRow).reduce((a, b) => a + b, 0) + toCol;
      }
    }
    if (tgtIdx < 0 || tgtIdx >= counts.length) return;
    if (tgtIdx === srcIdx) return; // no move

    // Respect locks: don't decrease below locked length, don't increase above locked length
    const srcCh = flat[srcIdx]?.ch;
    const tgtCh = flat[tgtIdx]?.ch;
    const srcLockedLen = srcCh && lockedKeys[srcCh] ? seqLengthFor(srcCh, lockedKeys[srcCh], candidatesByChar) : null;
    const tgtLockedLen = tgtCh && lockedKeys[tgtCh] ? seqLengthFor(tgtCh, lockedKeys[tgtCh], candidatesByChar) : null;
    if (srcLockedLen !== null && (counts[srcIdx] || 0) <= srcLockedLen) {
      setValidationMsg(`Presun zablokovaný: bunka ${srcCh} je uzamknutá na ${srcLockedLen} a nemožno z nej odobrať.`);
      return;
    }
    if (tgtLockedLen !== null && (counts[tgtIdx] || 0) >= tgtLockedLen) {
      setValidationMsg(`Presun zablokovaný: bunka ${tgtCh} je uzamknutá na ${tgtLockedLen} a nemožno do nej pridať.`);
      return;
    }

    // Apply move: decrement source by 1, increment target by 1
    if ((counts[srcIdx] || 0) <= 0) return;
    counts[srcIdx] = (counts[srcIdx] || 0) - 1;
    counts[tgtIdx] = (counts[tgtIdx] || 0) + 1;

    // Rebuild 2D groups
    const groups: number[][] = [];
    let k = 0;
    for (let r = 0; r < rowLens.length; r++) {
      const len = rowLens[r] || 0;
      const row: number[] = [];
      for (let c = 0; c < len; c++) row.push(Math.max(0, counts[k++] || 0));
      groups.push(row);
    }
    setRowGroups(groups);
    setValidationMsg('');
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-4">Nomenklátor – automatické návrhy</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-4 lg:col-span-2">
            <label className="block text-sm font-medium">OT (napr. AHOJ):</label>
            <textarea
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sem napíš OT text"
              value={otRaw}
              onChange={(e) => setOtRaw(e.target.value)}
            />

            <label className="block text-sm font-medium">ZT (napr. 12 34 12 56):</label>
            <textarea
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sem napíš ZT text (medzery = tokeny; bez medzier = po znakoch)"
              value={ztRaw}
              onChange={(e) => setZtRaw(e.target.value)}
            />

            <div className="flex items-center gap-3 text-sm mt-2">
              <label htmlFor="keysPerOT" className="whitespace-nowrap">Počet kľúčov na OT znak:</label>
              <select
                id="keysPerOT"
                className="border border-gray-300 rounded p-1 text-sm"
                value={keysPerOTMode}
                onChange={(e) => setKeysPerOTMode(e.target.value as KeysPerOTMode)}
              >
                <option value="single">Jeden OT znak na jednu sadu znakov</option>
                <option value="multiple" disabled>Viac kľúčov na znak (pripravuje sa)</option>
              </select>
              <button
                className="ml-auto inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded"
                onClick={runAnalysis}
                disabled={otChars.length === 0 || ztTokens.length === 0}
                title="Spustiť analýzu a návrhy zámkov"
              >
                Spustiť analýzu
              </button>
            </div>

            {Object.keys(candidatesByChar).length > 0 && (
              <div className="border border-gray-200 rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Návrhy</h3>
                  <div className="flex gap-2">
                      <label className="flex items-center gap-1 text-xs mr-2 select-none" title="Zobraziť aj kandidátov, ktorí sa nedajú správne zaradiť (pre pokročilé ladenie)">
                        <input
                          type="checkbox"
                          checked={showAllCandidates}
                          onChange={(e) => setShowAllCandidates(e.target.checked)}
                        />
                        Zobraziť všetkých kandidátov
                      </label>
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => {
                          setSelections({});
                          setLockedKeys({});
                          setRowGroups(baselineGroups);
                          setValidationMsg('');
                        }}
                        title="Vymazať všetky zámky a výbery"
                      >
                        Vymazať
                      </button>
                      
                    <button
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                      onClick={() => {
                        // Preview selections with validation; avoid overriding already locked keys
                        const effSel: SelectionMap = {};
                        for (const [ch, seq] of Object.entries(selections)) {
                          if (!lockedKeys[ch]) effSel[ch] = seq;
                        }
                        const base = rowGroups.length ? rowGroups : baselineGroups;
                        const res = validateSelections(effSel, candidatesByChar, base);
                        setRowGroups(res.preview);
                        setValidationMsg(res.ok ? '' : res.message);
                      }}
                    >
                      Náhľad výberu
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        const effSel: SelectionMap = {};
                        for (const [ch, seq] of Object.entries(selections)) {
                          if (!lockedKeys[ch]) effSel[ch] = seq ?? null;
                        }
                        const base = rowGroups.length ? rowGroups : baselineGroups;
                        const res = validateSelections(effSel, candidatesByChar, base);
                        setRowGroups(res.preview);
                        if (!res.ok) {
                          setValidationMsg(res.message + ' Zámky neboli aplikované.');
                          return;
                        }
                        setValidationMsg('');
                        const newLocks = locksFromSelections(effSel);
                        setLockedKeys(prev => ({ ...newLocks, ...prev }));
                      }}
                    >
                      Aplikovať výber
                    </button>
                  </div>
                </div>
                {validationMsg && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {validationMsg}
                  </div>
                )}
                
                <div className="space-y-2">
                  {Object.entries(candidatesByChar).sort((a,b)=> a[0].localeCompare(b[0])).map(([ch, list]) => (
                    <div key={ch} className="flex items-center gap-3">
                      <div className="w-10 font-mono text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-100 border border-gray-200">{ch}</span>
                      </div>
                      <select
                        className="border border-gray-300 rounded p-1 text-sm flex-1"
                        value={selections[ch] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || '';
                          setSelections(prev => ({ ...prev, [ch]: val === '' ? null : val }));
                        }}
                      >
                        <option value="">Žiadne (nezamknúť)</option>
                        {list.map((c, idx) => {
                          let required = 0;
                          // include locked keys
                          for (const [lk, seq] of Object.entries(lockedKeys)) {
                            if (seq) {
                              const occ = occurrencesByChar[lk] || 0;
                              required += occ * (seq.length);
                            }
                          }
                          // include other selections (exclude this 'ch')
                          for (const [sch, seq] of Object.entries(selections)) {
                            if (seq && sch !== ch) {
                              const occ = occurrencesByChar[sch] || 0;
                              const len = seqLengthFor(sch, seq, candidatesByChar);
                              required += occ * len;
                            }
                          }
                          // include this option for current 'ch'
                          const occCh = occurrencesByChar[ch] || 0;
                          required += occCh * c.length;
                          const overBudget = required > ztTokens.length;
                          // Alignment pre-check: build effective selection with this option applied (ignore locked ones duplicatively)
                          let alignOk = true;
                          let alignMsg: string | undefined = undefined;
                          if (!overBudget) {
                            const effSel: SelectionMap = {};
                            // include ALL locked keys as hard constraints
                            for (const [lk, lseq] of Object.entries(lockedKeys)) {
                              if (lseq) effSel[lk] = lseq;
                            }
                            // include other current selections except the char being evaluated (unless it's locked already)
                            for (const [sch, seq] of Object.entries(selections)) {
                              if (seq && sch !== ch && !lockedKeys[sch]) effSel[sch] = seq;
                            }
                            // apply this candidate for current char if not locked; if locked, keep locked
                            if (!lockedKeys[ch]) effSel[ch] = c.token;
                            const base = rowGroups.length ? rowGroups : baselineGroups;
                            const res = validateSelections(effSel, candidatesByChar, base);
                            alignOk = res.ok;
                            alignMsg = res.ok ? undefined : res.message || 'Nezaraditeľný výber';
                          }
                          const disabled = overBudget || (!alignOk && !showAllCandidates);
                          const title = overBudget
                            ? `Výber by prekročil dostupné tokeny (${required} > ${ztTokens.length}).`
                            : (!alignOk ? (alignMsg || 'Zarovnanie nezodpovedá výberu') : undefined);
                          return (
                            <option key={idx} value={c.token} disabled={disabled} title={title}>
                              {c.token} (k {c.length})
                            </option>
                          );
                        })}
                      </select>
                      {lockedKeys[ch] && (
                        <span className="text-xs text-green-700">locked: {lockedKeys[ch]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            

            <div>
              <div className="text-sm text-gray-600 mb-2">
                OT znakov: {otChars.length} • ZT tokenov: {ztTokens.length}
              </div>
              
              <MappingTable
                otRows={otRows}
                ztTokens={ztTokens}
                rowGroups={rowGroups}
                onMoveZTToken={onMoveZTTokenHandler}
                onLockOT={onLockOT}
                onUnlockOT={onUnlockOT}
                lockedKeys={lockedKeys}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold">Tabuľka kľúčov</h3>
            <KeyTable
              otRows={otRows}
              ztTokens={ztTokens}
              rowGroups={rowGroups}
              keysPerOTMode={keysPerOTMode}
              lockedKeys={lockedKeys}
              onLockOT={onLockOT}
              onUnlockOT={onUnlockOT}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default NomenklatorPage;
