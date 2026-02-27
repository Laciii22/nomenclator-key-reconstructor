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
