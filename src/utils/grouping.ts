/**
 * Utilities for mapping PT characters to expected CT token indices.
 * 
 * Handles deception/null tokens (bracketed) by skipping them in the alignment.
 */

import type { PTChar, CTToken } from '../types/domain';

/**
 * Compute expected CT indices for each PT character.
 * 
 * Aligns PT characters with CT tokens sequentially, skipping
 * any tokens marked as deception/null (bracketed).
 * 
 * @param ptRowsLocal Rows of PT characters
 * @param ctTokensLocal All CT tokens
 * @param bracketed Indices of tokens marked as deception/null
 * @returns Map of PT char → array of expected CT indices
 */
export function getExpectedCTIndicesForOT(
  ptRowsLocal: PTChar[][],
  ctTokensLocal: CTToken[],
  bracketed: number[]
): Record<string, number[]> {
  const flat: string[] = [];
  for (const row of ptRowsLocal) for (const cell of row) if (cell.ch !== '') flat.push(cell.ch);
  const br = new Set(bracketed);
  const map: Record<string, number[]> = {};
  let ptr = 0;
  for (let i = 0; i < ctTokensLocal.length && ptr < flat.length; i++) {
    if (br.has(i)) continue;
    const ch = flat[ptr];
    (map[ch] ||= []).push(i);
    ptr++;
  }
  return map;
}
