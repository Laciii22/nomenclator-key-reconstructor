/**
 * Utilities for mapping OT characters to expected ZT token indices.
 * 
 * Handles deception/null tokens (bracketed) by skipping them in the alignment.
 */

import type { OTChar, ZTToken } from '../types/domain';

/**
 * Compute expected ZT indices for each OT character.
 * 
 * Aligns OT characters with ZT tokens sequentially, skipping
 * any tokens marked as deception/null (bracketed).
 * 
 * @param otRowsLocal Rows of OT characters
 * @param ztTokensLocal All ZT tokens
 * @param bracketed Indices of tokens marked as deception/null
 * @returns Map of OT char → array of expected ZT indices
 */
export function getExpectedZTIndicesForOT(
  otRowsLocal: OTChar[][],
  ztTokensLocal: ZTToken[],
  bracketed: number[]
): Record<string, number[]> {
  const flat: string[] = [];
  for (const row of otRowsLocal) for (const cell of row) if (cell.ch !== '') flat.push(cell.ch);
  const br = new Set(bracketed);
  const map: Record<string, number[]> = {};
  let ptr = 0;
  for (let i = 0; i < ztTokensLocal.length && ptr < flat.length; i++) {
    if (br.has(i)) continue;
    const ch = flat[ptr];
    (map[ch] ||= []).push(i);
    ptr++;
  }
  return map;
}
