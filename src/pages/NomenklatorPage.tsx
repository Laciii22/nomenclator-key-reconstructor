import React, { useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { KeysPerOTMode } from '../components/types';
import type { OTChar, ZTToken } from '../types/domain';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import { analyze, type Candidate, type SelectionMap } from '../utils/analyzer';
import { computeRowAlloc } from '../utils/allocation';
import { useLocalSettings } from '../hooks/useLocalSettings';

const NomenklatorPage: React.FC = () => {
  const [settings, setSettings] = useLocalSettings({ keysPerOTMode: 'single' });
  const hydrated = useRef(false);
  const [otRaw, setOtRaw] = useState('');
  const [ztRaw, setZtRaw] = useState('');
  const [ztParseMode, setZtParseMode] = useState<'separator' | 'fixedLength'>('separator');
  const [separator, setSeparator] = useState<string>(' ');
  const [fixedLength, setFixedLength] = useState<number>(1);
  const [keysPerOTMode, setKeysPerOTMode] = useState<KeysPerOTMode>('single');
  const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});
  const getCounts = (rg: number[][][]) => rg.map(row => row.map(list => list.length));
  // Indices (v pôvodnom ZT) presunuté do zátvoriek (klamač)
  const [bracketedIndices, setBracketedIndices] = useState<number[]>([]);
  const [bracketWarning, setBracketWarning] = useState<string | null>(null);

  const convertCountsToLists = (counts: number[][]): number[][][] => {
    const groups: number[][][] = [];
    let start = 0;
    for (let r = 0; r < counts.length; r++) {
      const row: number[][] = [];
      for (let c = 0; c < counts[r].length; c++) {
        const count = counts[r][c];
        row.push(Array.from({length: count}, (_, i) => start + i));
        start += count;
      }
      groups.push(row);
    }
    return groups;
  };

  // row groups used for analysis (full token set)
  const [analysisRowGroups, setAnalysisRowGroups] = useState<number[][][]>([]);
  // row groups used for display (may exclude bracketed tokens)
  const [displayRowGroups, setDisplayRowGroups] = useState<number[][][]>([]);
  // Status related to (potential) klamáč identification
  // none: not enough data or no analysis yet
  // needsKlamac: more ZT tokens than OT chars (suspected klamáč present)
  // ok: counts aligned (either no klamáč needed or selected set balances)
  // invalid: OT > ZT (after removal) => removed too many tokens / damaged text
  const [klamacStatus, setKlamacStatus] = useState<'none' | 'needsKlamac' | 'ok' | 'invalid'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [candidatesByChar, setCandidatesByChar] = useState<Record<string, Candidate[]>>({});
  const [selections, setSelections] = useState<SelectionMap>({});
  const [selectionError, setSelectionError] = useState<string | null>(null);
  // Compute globally reserved tokens (locked + current selections)
  const reservedTokens = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(lockedKeys)) if (v) set.add(v);
    for (const v of Object.values(selections)) if (v) set.add(v);
    return set;
  }, [lockedKeys, selections]);

  // (Removed standalone occurrencesByToken – building occurrence map lazily in dropdown rendering)
  

  const otChars = useMemo(() => {
    const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
    return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [otRaw]);

  const ztTokens = useMemo(() => {
    const s = ztRaw.trim();
    let parts: string[];
    if (ztParseMode === 'separator') {
      parts = s.split(separator).filter(Boolean);
    } else {
      // fixedLength
      parts = [];
      for (let i = 0; i < s.length; i += fixedLength) {
        parts.push(s.slice(i, i + fixedLength));
      }
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

  // Analysis-first workflow: keep analysis working on full ztTokens; bracket filtering is only for output preview.
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

  // Baseline allocation whenever OT/ZT changes
  const baselineGroups = useMemo(() => {
    const { groups } = computeRowAlloc(otRows, ztTokens);
    return groups;
  }, [otRows, ztTokens]);

  // Flag to indicate analysis finished; bracket selection enabled after analysis
  const [analysisDone, setAnalysisDone] = useState(false);

  // Hydrate state from local settings once
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

  // Persist bracketed indices to settings
  React.useEffect(() => {
    setSettings(prev => {
      const prevStr = JSON.stringify(prev.bracketedIndices || []);
      const nextStr = JSON.stringify(bracketedIndices || []);
      return prevStr === nextStr ? prev : { ...prev, bracketedIndices };
    });
  }, [bracketedIndices, setSettings]);

  // Validate bracketed indices after parse changes; drop out-of-range and show a warning
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

  // Initialize analysis groups when OT/ZT change (excluding bracket changes); keep locks/selections
  React.useEffect(() => {
    const baseLists = convertCountsToLists(baselineGroups);
    setAnalysisRowGroups(baseLists);
    // Recompute display groups from analysis counts onto CURRENT effective tokens
    const baseCounts = getCounts(baseLists);
    const effSel: SelectionMap = {};
    for (const [lk, seq] of Object.entries(lockedKeys)) if (seq) effSel[lk] = seq;
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) effSel[ch] = seq;
    const effCounts = reflowRowGroups(otRows, effectiveZtTokens, baseCounts, effSel, candidatesByChar);
    setDisplayRowGroups(convertCountsToLists(effCounts));
  }, [baselineGroups, otRows, ztTokens]);

  // On bracket changes after analysis: reflow display counts; do not reset locks/selections
  React.useEffect(() => {
    if (!analysisDone) return;
    const baseCounts = getCounts(analysisRowGroups.length ? analysisRowGroups : convertCountsToLists(baselineGroups));
    const effSel: SelectionMap = {};
    for (const [lk, seq] of Object.entries(lockedKeys)) if (seq) effSel[lk] = seq;
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) effSel[ch] = seq;
    const effCounts = reflowRowGroups(otRows, effectiveZtTokens, baseCounts, effSel, candidatesByChar);
    setDisplayRowGroups(convertCountsToLists(effCounts));
  }, [bracketedIndices, effectiveZtTokens, analysisDone]);

  // Reflow display when locks or selections change (post-analysis), so chosen sequences land under correct OT cells
  React.useEffect(() => {
    if (!analysisDone) return;
    const baseCounts = getCounts(analysisRowGroups.length ? analysisRowGroups : convertCountsToLists(baselineGroups));
    const effSel: SelectionMap = {};
    for (const [lk, seq] of Object.entries(lockedKeys)) if (seq) effSel[lk] = seq;
    for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) effSel[ch] = seq;
    const effCounts = reflowRowGroups(otRows, effectiveZtTokens, baseCounts, effSel, candidatesByChar);
    setDisplayRowGroups(convertCountsToLists(effCounts));
  }, [lockedKeys, selections, candidatesByChar, analysisRowGroups, effectiveZtTokens, otRows, analysisDone]);

  // Update status after bracket changes (post-analysis) to hide/show warnings dynamically
  React.useEffect(() => {
    const OT = otChars.length;
    const totalZT = ztTokens.length;
    const effLen = effectiveZtTokens.length;
    if (OT === 0 || totalZT === 0) {
      setKlamacStatus('none');
      setStatusMessage(null);
      return;
    }
    // Before analysis we already set initial status in ztTokens memo.
    if (!analysisDone) return;
    // After analysis: evaluate effective length (with klamač removed)
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
    // Pass current locks so analyzer first honors them when computing starts/candidates
    const rg = (analysisRowGroups.length > 0 ? analysisRowGroups : convertCountsToLists(baselineGroups)) as number[][][];
    const base = getCounts(rg);
    const res = analyze(otRows, ztTokens, base, { keysPerOTMode }, lockedKeys);
    const analyzed = convertCountsToLists(res.proposedRowGroups);
    setAnalysisRowGroups(analyzed);
    // After analysis, display uses effective tokens (currently identical because no klamač yet)
    setDisplayRowGroups(analyzed);
    setCandidatesByChar(res.candidatesByChar);
    setSelections({});
    setAnalysisDone(true);
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
  // Removed flattenOTChars / flatGroupsFor (obsolete in simplified single-token model)

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
  // Target sum must match the ACTUAL token stream we're rendering over.
  // Using the base counts sum would keep the original (pre-klamáč) length and cause misalignment
  // when some tokens are filtered out. Therefore preserve "totalZT" instead of the base sum.
  const TARGET = totalZT;
    const isSelectedIndex = (i: number) => Boolean(selectionsIn[flat[i]?.ch]);
    const seqLenFor = (ch: string, seq: string) => {
      const found = (cands[ch] || []).find(c => c.token === seq);
      return found ? found.length : 1; // default to 1 token per selection if unknown
    };
    const matchAt = (start: number, seq: string, L: number) => {
      if (start < 0 || start + L > totalZT) return false;
      // Compare concatenated text of L tokens with expected sequence string
      let acc = '';
      for (let i = 0; i < L; i++) acc += tokens[start + i].text;
      return acc === seq;
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
  for (let p = 0; p + L <= totalZT; p++) if (matchAt(p, want!, L)) positions.push(p);
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
    if (sumNow > TARGET) {
      let need = sumNow - TARGET;
      for (let i = counts.length - 1; i >= 0 && need > 0; i--) {
        if (isSelectedIndex(i)) continue;
        const can = Math.min(counts[i], need);
        counts[i] -= can;
        need -= can;
      }
      // Fallback: if everything is selected (or still need remains), trim from the very last cell
      if (need > 0 && counts.length > 0) {
        const last = counts.length - 1;
        counts[last] = Math.max(0, counts[last] - need);
        need = 0;
      }
    } else if (sumNow < TARGET) {
      let need = TARGET - sumNow;
      for (let i = counts.length - 1; i >= 0 && need > 0; i--) {
        if (isSelectedIndex(i)) continue;
        counts[i] += 1;
        need -= 1;
      }
      // Fallback: when all cells are selected (e.g., after locking each OT), we still must place the extra tokens.
      // Distribute the remaining need into the last cell so no token disappears.
      if (need > 0 && counts.length > 0) {
        counts[counts.length - 1] += need;
        need = 0;
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
  // Removed validateSelections (unused in simplified deterministic mapping)

  // Build deterministic groups: each OT cell maps to exactly one token index (single-token model)
  function buildSingleTokenGroups(
    rows: OTChar[][],
    tokens: ZTToken[],
    forced: Record<string, string>, // char -> desired token text
  ): { groups: number[][][]; error: string | null } {
    // Queue token indices by text
    const queues: Record<string, number[]> = {};
    tokens.forEach((t, i) => { (queues[t.text] ||= []).push(i); });
    // Prepare structure
    const result: number[][][] = rows.map(r => r.filter(c => c.ch !== '').map(() => [] as number[]));
    const flatCells: { ch: string; row: number; col: number }[] = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r].filter(c => c.ch !== '');
      for (let c = 0; c < row.length; c++) flatCells.push({ ch: row[c].ch, row: r, col: c });
    }
    const used = new Set<number>();
    let error: string | null = null;
    // First pass: assign forced tokens (locked or selected)
    for (const cell of flatCells) {
      const want = forced[cell.ch];
      if (!want) continue;
      const q = queues[want];
      if (!q || q.length === 0) {
        error = `Token '${want}' nie je dostupný pre znak '${cell.ch}'.`;
        continue;
      }
      // take earliest unused occurrence
      let idx = -1;
      while (q.length && used.has(q[0])) q.shift();
      if (q.length) idx = q.shift()!;
      if (idx < 0) {
        error = `Token '${want}' už bol použitý všetkými výskytmi a chýba pre '${cell.ch}'.`;
        continue;
      }
      used.add(idx);
      result[cell.row][cell.col] = [idx];
    }
    // Remaining indices (unused tokens)
    const remaining = tokens.map((_, i) => i).filter(i => !used.has(i)).sort((a,b)=>a-b);
    // First pass: assign ONE to any empty cell (earliest remaining in order)
    let remCursor = 0;
    for (const cell of flatCells) {
      if (result[cell.row][cell.col].length === 0 && remCursor < remaining.length) {
        const idx = remaining[remCursor++];
        used.add(idx);
        result[cell.row][cell.col] = [idx];
      }
    }
    // Any leftover beyond one-per-cell should NOT disappear; distribute so overall ordering is preserved.
    const leftover: number[] = remaining.slice(remCursor);
    if (leftover.length > 0) {
      // Build array of cells with their current single indices (or empty)
      const cellInfos = flatCells.map(cell => {
        const arr = result[cell.row][cell.col];
        return { ...cell, indices: arr };
      });
      // For ordering, get representative index (minimum) per cell; empty cells get +Infinity so leftovers go before them if needed.
      const repIndices = cellInfos.map(ci => ci.indices.length ? Math.min(...ci.indices) : Number.POSITIVE_INFINITY);
      // Distribute each leftover index to the previous cell boundary so that global order across cells remains ascending.
      for (const li of leftover) {
        // Find first cell whose first index is strictly greater than li
        let firstGreaterIdx = -1;
        for (let i = 0; i < repIndices.length; i++) {
          if (repIndices[i] > li) { firstGreaterIdx = i; break; }
        }
        // Target is previous cell if found, otherwise last cell
        const targetCellIdx = firstGreaterIdx > 0 ? firstGreaterIdx - 1 : (firstGreaterIdx === 0 ? 0 : repIndices.length - 1);
        const target = cellInfos[targetCellIdx];
        // Insert into target cell keeping ascending order
        const arr = target.indices;
        let pos = 0;
        while (pos < arr.length && arr[pos] < li) pos++;
        arr.splice(pos, 0, li);
        // Update representative index in case target was empty (shouldn't happen after initial pass)
        repIndices[targetCellIdx] = Math.min(repIndices[targetCellIdx], li);
      }
    }

    // Final pass: enforce monotonic boundary across adjacent cells (max left < min right)
    {
      const cellInfos = flatCells.map(cell => ({ ...cell, indices: result[cell.row][cell.col] }));
      for (let i = 0; i < cellInfos.length - 1; i++) {
        const left = cellInfos[i].indices;
        const right = cellInfos[i + 1].indices;
        if (left.length === 0 || right.length === 0) continue;
        let maxLeft = left[left.length - 1];
        // While right has smaller items than maxLeft, move them into left keeping sort
        while (right.length > 0 && right[0] < maxLeft) {
          const v = right.shift()!;
          // insert v into left sorted position
          let p = 0;
          while (p < left.length && left[p] < v) p++;
          left.splice(p, 0, v);
          maxLeft = left[left.length - 1];
        }
      }
    }
    return { groups: result, error };
  }

  // Memoized occurrences of each OT char (non-empty cells only)
  // occurrencesByChar no longer needed (single-token deterministic mapping)

  // Helper to get length of a sequence for a given char from candidates or string length fallback
  // seqLengthFor removed (only single-token lengths now)

  // Drag-end handler: only boundary shift medzi susednými bunkami (už bez bracket drop).
  function onDragEnd(evt: DragEndEvent) {
    const data = evt.active?.data?.current as { type?: string; tokenIndex?: number; row?: number; col?: number } | undefined;
    const overId = evt.over?.id;
    if (!data || data.type !== 'zt' || typeof data.tokenIndex !== 'number') return;
    // Shift medzi susednými bunkami (iba hranové tokeny)
    if (typeof overId === 'string' && overId.startsWith('cell-') && data.row != null && data.col != null) {
      const match = /cell-(\d+)-(\d+)/.exec(String(overId));
      if (!match) return;
      const dstRow = parseInt(match[1], 10);
      const dstCol = parseInt(match[2], 10);
      const srcRow = data.row;
      const srcCol = data.col;
      if (srcRow === dstRow && srcCol === dstCol) return; // same cell
      // Block shifting if either source or destination cell is locked
      const srcCh = otRows[srcRow]?.[srcCol]?.ch;
      const dstCh = otRows[dstRow]?.[dstCol]?.ch;
      if ((srcCh && lockedKeys[srcCh]) || (dstCh && lockedKeys[dstCh])) return;
      // Build flattened coords for adjacency check
      const coords: {row:number; col:number}[] = [];
      for (let r=0; r<displayRowGroups.length; r++) {
        for (let c=0; c<displayRowGroups[r].length; c++) coords.push({row:r,col:c});
      }
      const idxOf = (row:number,col:number) => coords.findIndex(k => k.row===row && k.col===col);
      const srcFlat = idxOf(srcRow, srcCol);
      const dstFlat = idxOf(dstRow, dstCol);
      if (srcFlat < 0 || dstFlat < 0) return;
      if (Math.abs(srcFlat - dstFlat) !== 1) return; // only immediate neighbor shifts
      const direction = dstFlat < srcFlat ? 'left' : 'right';
      const srcList = displayRowGroups[srcRow]?.[srcCol];
      const dstList = displayRowGroups[dstRow]?.[dstCol];
      if (!srcList || !dstList) return;
      if (srcList.length === 0) return;
      const tokenIdx = data.tokenIndex;
      if (direction === 'left') {
        // must be FIRST token of source to move left
        if (srcList[0] !== tokenIdx) return;
        const moving = srcList[0];
        const newSrc = srcList.slice(1);
        const newDst = [...dstList, moving];
        mutateDisplayGroups(srcRow, srcCol, newSrc, dstRow, dstCol, newDst);
      } else {
        // right: must be LAST token of source
        if (srcList[srcList.length - 1] !== tokenIdx) return;
        const moving = srcList[srcList.length - 1];
        const newSrc = srcList.slice(0, -1);
        const newDst = [moving, ...dstList];
        mutateDisplayGroups(srcRow, srcCol, newSrc, dstRow, dstCol, newDst);
      }
    }
  }

  // Immutable update of two cells in displayRowGroups after a shift
  function mutateDisplayGroups(srcRow: number, srcCol: number, newSrc: number[], dstRow: number, dstCol: number, newDst: number[]) {
    setDisplayRowGroups(prev => {
      const copy = prev.map(row => row.map(cell => [...cell]));
      if (copy[srcRow] && copy[srcRow][srcCol]) copy[srcRow][srcCol] = newSrc;
      if (copy[dstRow] && copy[dstRow][dstCol]) copy[dstRow][dstCol] = newDst;
      return copy;
    });
  }

  // Bracket drop area odstránená – označenie klamáča prebieha kliknutím.

  // Map effective index from MappingTable to original ZT index (skipping bracketed ones)
  // effectiveToOriginalIndex no longer needed after simplification; removed.

  // Toggle bracket for ALL occurrences sharing the same token text as original index i
  function toggleBracketGroupByOriginalIndex(i: number) {
    const text = ztTokens[i]?.text;
    if (!text) return;
    const sameTextIdx = ztTokens.map((t, idx) => (t.text === text ? idx : -1)).filter(idx => idx >= 0);
    setBracketedIndices(prev => {
      const set = new Set(prev);
      const allAreBracketed = sameTextIdx.every(idx => set.has(idx));
      if (allAreBracketed) {
        // Remove all occurrences
        for (const idx of sameTextIdx) set.delete(idx);
      } else {
        // Add any missing occurrences
        for (const idx of sameTextIdx) set.add(idx);
      }
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  return (
    <AppLayout>
      <DndContext onDragEnd={onDragEnd}>
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

            {statusMessage && (
              <div
                className={`text-sm rounded p-2 mt-2 border ${
                  klamacStatus === 'invalid'
                    ? 'text-red-700 bg-red-50 border-red-300'
                    : klamacStatus === 'needsKlamac'
                      ? 'text-orange-700 bg-orange-50 border-orange-300'
                      : 'text-green-700 bg-green-50 border-green-300'
                }`}
              >
                {statusMessage}
              </div>
            )}

            {/* Klamac/bracket editor: po analýze – iba kliknutie, bez drag & drop */}
            {ztTokens.length > 0 && analysisDone && (
              <div className="border rounded p-3 border-purple-200 bg-purple-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">Klamáč (presun tokenov do zátvoriek)</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200"
                      onClick={() => setBracketedIndices([])}
                      title="Vyprázdniť zátvorky"
                    >Vyprázdniť</button>
                  </div>
                </div>
                {bracketWarning && (
                  <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 mb-2">{bracketWarning}</div>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono">{otRaw.trim() || '—'}</span>
                  <span className="font-mono">[
                    {bracketedIndices.length > 0 ? bracketedIndices.map(i => ztTokens[i]?.text).filter(Boolean).join(':') : ''}
                  ]</span>
                  <span className="font-mono">
                    {effectiveZtTokens.map(t => t.text).join(':') || '—'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="text-xs text-gray-600 mr-2">Tokeny (klik = označiť/vrátiť klamáč):</div>
                  {ztTokens.map((t, i) => {
                    const inBracket = bracketedIndices.includes(i);
                    return (
                      <button
                        key={t.id}
                        className={`text-xs font-mono px-1.5 py-0.5 rounded border select-none ${
                          inBracket ? 'bg-purple-200 border-purple-300 text-purple-900' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                        }`}
                        onClick={() => toggleBracketGroupByOriginalIndex(i)}
                        title={inBracket ? 'Vrátiť všetky rovnaké tokeny zo zátvoriek' : 'Presunúť všetky rovnaké tokeny do zátvoriek'}
                      >
                        {t.text}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 text-sm mt-2">
              <label htmlFor="ztParseMode" className="whitespace-nowrap">Parsovanie ZT:</label>
              <select
                id="ztParseMode"
                className="border border-gray-300 rounded p-1 text-sm"
                value={ztParseMode}
                onChange={(e) => setZtParseMode(e.target.value as 'separator' | 'fixedLength')}
              >
                <option value="separator">Oddelené znakom</option>
                <option value="fixedLength">Pevná dĺžka</option>
              </select>
              {ztParseMode === 'separator' && (
                <>
                  <label htmlFor="separator" className="whitespace-nowrap">Znak:</label>
                  <input
                    id="separator"
                    type="text"
                    maxLength={1}
                    className="border border-gray-300 rounded p-1 text-sm w-12 text-center"
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                  />
                </>
              )}
              {ztParseMode === 'fixedLength' && (
                <>
                  <label htmlFor="fixedLength" className="whitespace-nowrap">Dĺžka:</label>
                  <input
                    id="fixedLength"
                    type="number"
                    min="1"
                    className="border border-gray-300 rounded p-1 text-sm w-16"
                    value={fixedLength}
                    onChange={(e) => setFixedLength(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </>
              )}
            </div>

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
                      {/* Removed showAllCandidates checkbox and logic */}
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => {
                          setSelections({});
                          setLockedKeys({});
                          setAnalysisRowGroups(convertCountsToLists(baselineGroups));
                          const { groups: effGroups } = computeRowAlloc(otRows, effectiveZtTokens);
                          setDisplayRowGroups(convertCountsToLists(effGroups));
                        }}
                        title="Vymazať všetky zámky a výbery"
                      >
                        Vymazať
                      </button>
                      
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => {
                          const forced: Record<string,string> = { ...lockedKeys };
                          for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) forced[ch] = seq;
                          const { groups, error } = buildSingleTokenGroups(otRows, effectiveZtTokens, forced);
                          const totalCells = otRows.reduce((a,row)=> a + row.filter(c=> c.ch !== '').length,0);
                          let finalError = error;
                          if (!finalError && bracketedIndices.length === 0 && effectiveZtTokens.length > totalCells) {
                            const diff = effectiveZtTokens.length - totalCells;
                            finalError = `Chýba klamáč: Je o ${diff} ZT token(y) viac ako OT znakov.`;
                          }
                          setSelectionError(finalError);
                          setDisplayRowGroups(groups);
                        }}
                      >Náhľad výberu</button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        const forced: Record<string,string> = { ...lockedKeys };
                        for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) forced[ch] = seq;
                        const { groups, error } = buildSingleTokenGroups(otRows, effectiveZtTokens, forced);
                        const totalCells = otRows.reduce((a,row)=> a + row.filter(c=> c.ch !== '').length,0);
                        let finalError = error;
                        if (!finalError && bracketedIndices.length === 0 && effectiveZtTokens.length > totalCells) {
                          const diff = effectiveZtTokens.length - totalCells;
                          finalError = `Chýba klamáč: Je o ${diff} ZT token(y) viac ako OT znakov – nemožno aplikovať.`;
                        }
                        setSelectionError(finalError);
                        setDisplayRowGroups(groups);
                        if (!finalError) {
                          // lock selections
                          const newLocks: Record<string,string> = {};
                          for (const [ch, seq] of Object.entries(selections)) if (seq && !lockedKeys[ch]) newLocks[ch] = seq;
                          setLockedKeys(prev => ({ ...prev, ...newLocks }));
                        }
                      }}
                    >Aplikovať výber</button>
                  </div>
                </div>
                {selectionError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {selectionError}
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
                        {list.filter(c => c.length === 1).map((c, idx) => {
                          const takenByOther = reservedTokens.has(c.token) && selections[ch] !== c.token && lockedKeys[ch] !== c.token;
                            // Order constraint: First OT cell must not skip the very first token.
                            // Determine flat index of this OT char among non-empty OT chars.
                            // Build flat OT once (memoized extraction similar to earlier logic)
                            // We'll compute it inline for clarity; cost negligible.
                            const cellFlatIndex = (() => {
                              let idx = 0;
                              for (const row of otRows) {
                                for (const cell of row) {
                                  if (cell.ch !== '') {
                                    if (cell.ch === ch) return idx;
                                    idx++;
                                  }
                                }
                              }
                              return -1;
                            })();
                            // Build occurrence map lazily (effective tokens only)
                            const occMap: Record<string, number[]> = {};
                            effectiveZtTokens.forEach((t, i) => { (occMap[t.text] ||= []).push(i); });
                            const occ = occMap[c.token] || [];
                            let orderInvalid = false;
                            if (cellFlatIndex === 0) {
                              // For very first cell, only allow token whose FIRST occurrence is exactly at 0
                              const firstOcc = occ.length ? occ[0] : -1;
                              orderInvalid = firstOcc !== 0; // hide if earliest occurrence not at start
                            }
                            // Future refinement: could add constraints for later cells (e.g., prevent choosing token whose next unused occurrence lies before startIndex), but user request targets first cell scenario.
                            const disabled = takenByOther || orderInvalid;
                          return (
                              <option
                                key={idx}
                                value={c.token}
                                disabled={disabled}
                                title={
                                  takenByOther
                                    ? 'Tento token je už použitý pre iný znak'
                                    : orderInvalid
                                      ? 'Token by preskočil prvý pôvodný token – nie je povolený pre prvý znak'
                                      : undefined
                                }
                              >
                                {c.token}
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
                ztTokens={effectiveZtTokens}
                rowGroups={displayRowGroups}
                onLockOT={onLockOT}
                onUnlockOT={onUnlockOT}
                lockedKeys={lockedKeys}
                hasDeceptionWarning={klamacStatus === 'needsKlamac'}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold">Tabuľka kľúčov</h3>
            <KeyTable
              otRows={otRows}
              ztTokens={effectiveZtTokens}
              rowGroups={displayRowGroups.length > 0 ? displayRowGroups : convertCountsToLists(baselineGroups)}
              keysPerOTMode={keysPerOTMode}
              lockedKeys={lockedKeys}
              onLockOT={onLockOT}
              onUnlockOT={onUnlockOT}
            />
          </div>
        </div>
      </div>
      </DndContext>
    </AppLayout>
  );
};

export default NomenklatorPage;
