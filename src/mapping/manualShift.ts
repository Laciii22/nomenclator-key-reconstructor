import type { Column } from '../components/types';

export function deriveCountsFromColumns(baseColumns: Column[][], maxLen: number): number[] {
  const out: number[] = [];
  for (const row of baseColumns) {
    for (const col of row) {
      if (!col.ot) continue;
      out.push(Array.isArray(col.zt) ? Math.min(col.zt.length, maxLen) : 0);
    }
  }
  return out;
}

export function canShiftLeft(counts: number[], index: number): boolean {
  return index > 0 && index < counts.length && (counts[index] ?? 0) > 1;
}

export function canShiftRight(counts: number[], index: number): boolean {
  return index >= 0 && index < counts.length - 1 && (counts[index] ?? 0) > 1;
}

export function shiftRight(countsIn: number[], index: number, maxLen: number): number[] {
  const counts = [...countsIn];
  if (!canShiftRight(counts, index)) return countsIn;

  counts[index] -= 1;
  counts[index + 1] += 1;

  // Cascade overflow to the right to respect maxLen
  for (let i = index + 1; i < counts.length - 1; i++) {
    if (counts[i] > maxLen) {
      const overflow = counts[i] - maxLen;
      counts[i] -= overflow;
      counts[i + 1] += overflow;
    }
  }

  return counts;
}

export function shiftLeft(countsIn: number[], index: number, maxLen: number): number[] {
  const counts = [...countsIn];
  if (!canShiftLeft(counts, index)) return countsIn;

  counts[index] -= 1;
  counts[index - 1] += 1;

  // Cascade overflow to the left to respect maxLen
  for (let i = index - 1; i > 0; i--) {
    if (counts[i] > maxLen) {
      const overflow = counts[i] - maxLen;
      counts[i] -= overflow;
      counts[i - 1] += overflow;
    }
  }

  return counts;
}
