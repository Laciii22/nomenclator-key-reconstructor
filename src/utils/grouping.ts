import type { OTChar, ZTToken } from '../types/domain';
import type { Candidate, SelectionMap } from './analyzer';

// Return counts (lengths) from groups of token indices
export function getCounts(rg: number[][][]): number[][] {
  return rg.map(row => row.map(list => list.length));
}

// Convert 2D counts to explicit index lists (0..N-1) in reading order
export function convertCountsToLists(counts: number[][]): number[][][] {
  const groups: number[][][] = [];
  let start = 0;
  for (let r = 0; r < counts.length; r++) {
    const row: number[][] = [];
    for (let c = 0; c < counts[r].length; c++) {
      const count = counts[r][c];
      row.push(Array.from({ length: count }, (_, i) => start + i));
      start += count;
    }
    groups.push(row);
  }
  return groups;
}

// Try to align selected sequences to desired positions by shifting counts between neighbor cells
export function reflowRowGroups(
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
  const TARGET = totalZT;
  const isSelectedIndex = (i: number) => Boolean(selectionsIn[flat[i]?.ch]);
  const seqLenFor = (ch: string, seq: string) => {
    const found = (cands[ch] || []).find(c => c.token === seq);
    return found ? found.length : 1; // default to 1 token per selection if unknown
  };
  const matchAt = (start: number, seq: string, L: number) => {
    if (start < 0 || start + L > totalZT) return false;
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
      let bestAbs = Number.POSITIVE_INFINITY;
      let bestIdx = -1;
      for (let idx = 0; idx < positions.length; idx++) {
        const p = positions[idx];
        const abs = Math.abs(p - cursor);
        if (abs < bestAbs) { bestAbs = abs; bestIdx = idx; }
        else if (abs === bestAbs) {
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
    if (need > 0 && counts.length > 0) {
      const last = counts.length - 1;
      counts[last] = Math.max(0, counts[last] - need);
    }
  } else if (sumNow < TARGET) {
    let need = TARGET - sumNow;
    for (let i = counts.length - 1; i >= 0 && need > 0; i--) {
      if (isSelectedIndex(i)) continue;
      counts[i] += 1;
      need -= 1;
    }
    if (need > 0 && counts.length > 0) {
      counts[counts.length - 1] += need;
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

// Deterministic single-token mapping builder
export function buildSingleTokenGroups(
  rows: OTChar[][],
  tokens: ZTToken[],
  forced: Record<string, string>,
): { groups: number[][][]; error: string | null } {
  const queues: Record<string, number[]> = {};
  tokens.forEach((t, i) => { (queues[t.text] ||= []).push(i); });
  const result: number[][][] = rows.map(r => r.filter(c => c.ch !== '').map(() => [] as number[]));
  const flatCells: { ch: string; row: number; col: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r].filter(c => c.ch !== '');
    for (let c = 0; c < row.length; c++) flatCells.push({ ch: row[c].ch, row: r, col: c });
  }
  const used = new Set<number>();
  let error: string | null = null;
  // First pass: forced
  for (const cell of flatCells) {
    const want = forced[cell.ch];
    if (!want) continue;
    const q = queues[want];
    if (!q || q.length === 0) {
      error = `Token '${want}' nie je dostupný pre znak '${cell.ch}'.`;
      continue;
    }
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
  // Remaining indices
  const remaining = tokens.map((_, i) => i).filter(i => !used.has(i)).sort((a, b) => a - b);
  let remCursor = 0;
  for (const cell of flatCells) {
    if (result[cell.row][cell.col].length === 0 && remCursor < remaining.length) {
      const idx = remaining[remCursor++];
      used.add(idx);
      result[cell.row][cell.col] = [idx];
    }
  }
  const leftover: number[] = remaining.slice(remCursor);
  if (leftover.length > 0) {
    const cellInfos = flatCells.map(cell => {
      const arr = result[cell.row][cell.col];
      return { ...cell, indices: arr };
    });
    const repIndices = cellInfos.map(ci => ci.indices.length ? Math.min(...ci.indices) : Number.POSITIVE_INFINITY);
    for (const li of leftover) {
      let firstGreaterIdx = -1;
      for (let i = 0; i < repIndices.length; i++) {
        if (repIndices[i] > li) { firstGreaterIdx = i; break; }
      }
      const targetCellIdx = firstGreaterIdx > 0 ? firstGreaterIdx - 1 : (firstGreaterIdx === 0 ? 0 : repIndices.length - 1);
      const target = cellInfos[targetCellIdx];
      const arr = target.indices;
      let pos = 0;
      while (pos < arr.length && arr[pos] < li) pos++;
      arr.splice(pos, 0, li);
      repIndices[targetCellIdx] = Math.min(repIndices[targetCellIdx], li);
    }
  }
  // Enforce monotonic boundary
  {
    const cellInfos = flatCells.map(cell => ({ ...cell, indices: result[cell.row][cell.col] }));
    for (let i = 0; i < cellInfos.length - 1; i++) {
      const left = cellInfos[i].indices;
      const right = cellInfos[i + 1].indices;
      if (left.length === 0 || right.length === 0) continue;
      let maxLeft = left[left.length - 1];
      while (right.length > 0 && right[0] < maxLeft) {
        const v = right.shift()!;
        let p = 0;
        while (p < left.length && left[p] < v) p++;
        left.splice(p, 0, v);
        maxLeft = left[left.length - 1];
      }
    }
  }
  return { groups: result, error };
}

// Helper: map effective ZT positions back to original ZT indices (skipping bracketed tokens)
export function getExpectedZTIndicesForOT(
  otRowsLocal: OTChar[][],
  ztTokensLocal: ZTToken[],
  bracketed: number[]
): Record<string, number[]> {
  const flatOT: OTChar[] = [];
  for (const row of otRowsLocal) for (const cell of row) if (cell.ch !== '') flatOT.push(cell);
  const brSet = new Set(bracketed || []);
  const effectiveToOriginal: number[] = [];
  for (let i = 0; i < ztTokensLocal.length; i++) {
    if (!brSet.has(i)) effectiveToOriginal.push(i);
  }
  const result: Record<string, number[]> = {};
  for (let j = 0; j < flatOT.length; j++) {
    const ch = flatOT[j].ch;
    const orig = effectiveToOriginal[j];
    if (orig == null) continue;
    (result[ch] ||= []).push(orig);
  }
  return result;
}
