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
  // Flatten PT rows into a sequence of non-empty characters
  const flatPT: string[] = [];
  for (const row of ptRowsLocal) {
    for (const cell of row) {
      if (cell.ch !== '') flatPT.push(cell.ch);
    }
  }

  const bracketedSet = new Set(bracketed);
  const map: Record<string, number[]> = {};
  let ptPtr = 0;

  for (let ctIdx = 0; ctIdx < ctTokensLocal.length && ptPtr < flatPT.length; ctIdx++) {
    if (bracketedSet.has(ctIdx)) continue;
    const ch = flatPT[ptPtr];
    (map[ch] ||= []).push(ctIdx);
    ptPtr++;
  }

  return map;
}
