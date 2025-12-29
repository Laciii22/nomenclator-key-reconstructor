/**
 * Manual token shifting utilities for fixed-length mode.
 * 
 * Allows users to manually adjust how many tokens are allocated to each OT cell
 * by shifting tokens left or right between adjacent cells.
 * 
 * Shifting respects a maximum group size and cascades overflows.
 */

import type { Column } from '../components/types';

/**
 * Extract per-OT-cell token counts from columns.
 * Clamps each cell's count to maxLen.
 */
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

/**
 * Check if a cell can shift tokens to the left.
 * Requires >1 token and a cell to the left.
 */
export function canShiftLeft(counts: number[], index: number): boolean {
  return index > 0 && index < counts.length && (counts[index] ?? 0) > 1;
}

/**
 * Check if a cell can shift tokens to the right.
 * Requires >1 token and a cell to the right.
 */
export function canShiftRight(counts: number[], index: number): boolean {
  return index >= 0 && index < counts.length - 1 && (counts[index] ?? 0) > 1;
}

/**
 * Shift one token from a cell to its right neighbor.
 * Cascades overflow to maintain maxLen constraint.
 */
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

/**
 * Shift one token from a cell to its left neighbor.
 * Cascades overflow to maintain maxLen constraint.
 */
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
