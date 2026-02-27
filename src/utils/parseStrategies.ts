/**
 * Parse strategies for CT token grouping.
 * 
 * - separator: each token stands alone (delimiter-separated)
 * - fixedLength: tokens are grouped into fixed-size sequences
 */

import type { CTToken } from '../types/domain';

export type ParseMode = 'separator' | 'fixedLength';

/**
 * Determine the group size based on the parse mode.
 * In fixedLength mode, returns the specified length; otherwise 1.
 */
export function getGroupSize(mode: ParseMode, fixedLength?: number) {
  return mode === 'fixedLength' ? (fixedLength && fixedLength > 0 ? fixedLength : 1) : 1;
}

/**
 * Build a map of token text → array of starting indices.
 * For fixed-length mode, creates multi-token keys by concatenating sequences.
 */
export function buildOccMap(effectiveCtTokens: CTToken[], groupSize: number) {
  const occMap: Record<string, number[]> = {};
  if (groupSize === 1) {
    effectiveCtTokens.forEach((t, i) => { (occMap[t.text] ||= []).push(i); });
  } else {
    // Include final shorter group if tokens length is not divisible by groupSize
    for (let i = 0; i < effectiveCtTokens.length; i += groupSize) {
      const grp = effectiveCtTokens.slice(i, i + groupSize).map(x => x.text).join('');
      (occMap[grp] ||= []).push(i);
    }
  }
  return occMap;
}
