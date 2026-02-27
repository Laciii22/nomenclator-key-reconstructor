/**
 * Manual token shifting utilities for fixed-length mode.
 * 
 * Allows users to manually adjust how many tokens are allocated to each PT cell
 * by shifting tokens left or right between adjacent cells.
 * 
 * Shifting respects a maximum group size and cascades overflows.
 */

import type { Column } from '../components/types';

/**
 * Extract per-PT-cell token counts from columns.
 * Includes deception cells (pt: null) for complete grid representation.
 * Clamps each cell's count to maxLen.
 */
export function deriveCountsFromColumns(baseColumns: Column[][], maxLen: number): number[] {
  const out: number[] = [];
  for (const row of baseColumns) {
    for (const col of row) {
      // Include both PT cells and deception cells
      out.push(Array.isArray(col.ct) ? Math.min(col.ct.length, maxLen) : 0);
    }
  }
  return out;
}

/**
 * Check if a cell can shift tokens to the left.
 * Requires >1 token and a cell to the left.
 * Simulates the shift to ensure no cell exceeds maxLen.
 */
export function canShiftLeft(counts: number[], index: number, maxLen: number): boolean {
  if (index <= 0 || index >= counts.length || (counts[index] ?? 0) <= 1) {
    return false;
  }
  
  // Simulate the shift to check if it would violate maxLen
  const simulated = [...counts];
  simulated[index] -= 1;
  simulated[index - 1] += 1;
  
  // Simulate cascade
  for (let i = index - 1; i >= 0; i--) {
    if (simulated[i] > maxLen) {
      if (i === 0) {
        // First cell would exceed maxLen with nowhere to cascade
        return false;
      }
      const overflow = simulated[i] - maxLen;
      simulated[i] -= overflow;
      simulated[i - 1] += overflow;
    }
  }
  
  return true;
}

/**
 * Check if a cell can shift tokens to the right.
 * Requires >1 token and a cell to the right.
 * Simulates the shift to ensure no cell exceeds maxLen.
 */
export function canShiftRight(counts: number[], index: number, maxLen: number): boolean {
  if (index < 0 || index >= counts.length - 1 || (counts[index] ?? 0) <= 1) {
    return false;
  }
  
  // Simulate the shift to check if it would violate maxLen
  const simulated = [...counts];
  simulated[index] -= 1;
  simulated[index + 1] += 1;
  
  // Simulate cascade
  for (let i = index + 1; i < simulated.length; i++) {
    if (simulated[i] > maxLen) {
      if (i === simulated.length - 1) {
        // Last cell would exceed maxLen with nowhere to cascade
        return false;
      }
      const overflow = simulated[i] - maxLen;
      simulated[i] -= overflow;
      simulated[i + 1] += overflow;
    }
  }
  
  return true;
}

/**
 * Shift one token from a cell to its right neighbor.
 * Cascades overflow to maintain maxLen constraint.
 */
export function shiftRight(countsIn: number[], index: number, maxLen: number): number[] {
  const counts = [...countsIn];
  if (!canShiftRight(counts, index, maxLen)) return countsIn;

  counts[index] -= 1;
  counts[index + 1] += 1;

  // Cascade overflow to the right to respect maxLen
  for (let i = index + 1; i < counts.length; i++) {
    if (counts[i] > maxLen) {
      if (i === counts.length - 1) {
        // Should not happen if canShiftRight was checked
        return countsIn;
      }
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
  if (!canShiftLeft(counts, index, maxLen)) return countsIn;

  counts[index] -= 1;
  counts[index - 1] += 1;

  // Cascade overflow to the left to respect maxLen
  for (let i = index - 1; i >= 0; i--) {
    if (counts[i] > maxLen) {
      if (i === 0) {
        // Should not happen if canShiftLeft was checked
        return countsIn;
      }
      const overflow = counts[i] - maxLen;
      counts[i] -= overflow;
      counts[i - 1] += overflow;
    }
  }

  return counts;
}
