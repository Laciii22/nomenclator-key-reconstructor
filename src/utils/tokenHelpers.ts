/**
 * Helper functions for working with ZT tokens.
 */

import type { ZTToken } from '../types/domain';

/**
 * Convert an array of indices to an array of ZT tokens.
 * Filters out undefined/null entries (for out-of-bounds indices).
 */
export function tokensFromIndices(ztTokens: ZTToken[], indices: number[] | undefined): ZTToken[] {
  if (!Array.isArray(indices) || indices.length === 0) return [];
  return indices.map(i => ztTokens[i]).filter(Boolean) as ZTToken[];
}

/**
 * Join token text values into a single string.
 * Useful for displaying fixed-length token groups.
 */
export function joinTokenTexts(tokens: ZTToken[], fallback = ''): string {
  if (!tokens || tokens.length === 0) return fallback;
  return tokens.map(t => t.text).join('');
}
