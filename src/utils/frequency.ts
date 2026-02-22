/**
 * Shared frequency computation utilities for nomenclator analysis.
 *
 * These pure functions precompute frequency maps to avoid redundant O(n)
 * scans across scoring and analysis calls. All functions are stateless
 * and side-effect free.
 */

import type { OTChar, ZTToken } from '../types/domain';

/**
 * Count occurrences of each OT character across all rows.
 * Excludes empty placeholder cells.
 *
 * @returns Map of character → occurrence count
 */
export function countOtFrequency(otRows: readonly OTChar[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of otRows) {
    for (const cell of row) {
      if (!cell || cell.ch === '') continue;
      counts.set(cell.ch, (counts.get(cell.ch) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Count occurrences of each token text in the ZT array.
 *
 * @returns Map of token text → occurrence count
 */
export function countTokenFrequency(tokens: readonly ZTToken[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t.text, (counts.get(t.text) || 0) + 1);
  }
  return counts;
}

/**
 * Calculate similarity ratio between two frequencies.
 * Returns a score from 0 to 1, where 1 means perfect match.
 */
export function scoreRatio(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

/**
 * Flatten OT rows to a 1D array, excluding empty placeholder cells.
 * Used by the analyzer to build a flat cell list for position mapping.
 */
export function flattenOtChars(otRows: readonly OTChar[][]): (OTChar | null)[] {
  const flat: (OTChar | null)[] = [];
  for (const row of otRows) {
    for (const cell of row) {
      if (cell && cell.ch !== '') flat.push(cell);
    }
  }
  return flat;
}

/**
 * Build a mapping from OT character → flat positions where it appears.
 */
export function buildCharPositionMap(flat: readonly (OTChar | null)[]): Record<string, number[]> {
  const positions: Record<string, number[]> = {};
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]?.ch;
    if (!ch) continue;
    (positions[ch] ||= []).push(i);
  }
  return positions;
}

/**
 * Build a token text → position indices map from a ZT array.
 * Useful for O(1) token position lookups instead of repeated linear scans.
 */
export function buildTokenPositionMap(tokens: readonly ZTToken[]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (let i = 0; i < tokens.length; i++) {
    const text = tokens[i].text;
    const arr = positions.get(text);
    if (arr) arr.push(i);
    else positions.set(text, [i]);
  }
  return positions;
}

/**
 * Normalize locked keys to single-key format.
 * In multi-key mode, uses the first token for allocation purposes.
 */
export function normalizeLocks(
  lockedKeys: Record<string, string | string[]> | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!lockedKeys) return result;
  for (const [ch, val] of Object.entries(lockedKeys)) {
    if (Array.isArray(val)) {
      if (val.length > 0) result[ch] = val[0];
    } else if (val) {
      result[ch] = val;
    }
  }
  return result;
}
