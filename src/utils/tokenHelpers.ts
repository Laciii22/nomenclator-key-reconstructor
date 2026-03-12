/**
 * Helper functions for working with CT tokens.
 */

import type { CTToken } from '../types/domain';

/**
 * Convert an array of indices to an array of CT tokens.
 * Filters out undefined/null entries (for out-of-bounds indices).
 */
export function tokensFromIndices(ctTokens: CTToken[], indices: number[] | undefined): CTToken[] {
  if (!Array.isArray(indices) || indices.length === 0) return [];
  return indices.map(i => ctTokens[i]).filter(Boolean) as CTToken[];
}

/**
 * Join token text values into a single string.
 * Useful for displaying fixed-length token groups.
 */
export function joinTokenTexts(tokens: CTToken[], fallback = ''): string {
  if (!tokens || tokens.length === 0) return fallback;
  return tokens.map(t => t.text).join('');
}

/**
 * Expand token indices for display in fixed-length mode.
 *
 * When `groupSize > 1` and the cell owns fewer indices than `groupSize`,
 * the function expands from the start index if `allowExpandFromStart` is
 * true and sufficient tokens exist in the token array.
 */
export function expandDisplayedIndices(
  tokenIndices: number[],
  groupSize: number,
  allowExpandFromStart: boolean,
  totalTokenCount: number,
): number[] {
  if (tokenIndices.length === 0) return [];
  if (groupSize <= 1) return tokenIndices.slice();
  if (tokenIndices.length >= groupSize) return tokenIndices.slice(0, groupSize);

  if (tokenIndices.length === 1 && allowExpandFromStart) {
    const start = tokenIndices[0];
    const expanded: number[] = [];
    for (let offset = 0; offset < groupSize; offset++) {
      const idx = start + offset;
      if (idx < totalTokenCount) expanded.push(idx);
    }
    return expanded;
  }

  return tokenIndices.slice();
}
