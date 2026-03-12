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
export function buildOccMap(effectiveCtTokens: CTToken[], groupSize: number): Record<string, number[]> {
  const occMap: Record<string, number[]> = {};
  const step = groupSize > 1 ? groupSize : 1;

  for (let i = 0; i < effectiveCtTokens.length; i += step) {
    // Concatenate `groupSize` tokens into a single key (or just use one token for separator mode)
    let key = '';
    for (let g = 0; g < step && i + g < effectiveCtTokens.length; g++) {
      key += effectiveCtTokens[i + g].text;
    }
    (occMap[key] ||= []).push(i);
  }

  return occMap;
}
