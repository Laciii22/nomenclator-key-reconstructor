import type { ZTToken } from '../types/domain';

// Return an array of tokens for the given indices, filtering out null/undefined
export function tokensFromIndices(ztTokens: ZTToken[], indices: number[] | undefined): ZTToken[] {
  if (!Array.isArray(indices) || indices.length === 0) return [];
  return indices.map(i => ztTokens[i]).filter(Boolean) as ZTToken[];
}

// Join token.text values into a single string (useful for fixed-length groups)
export function joinTokenTexts(tokens: ZTToken[], fallback = ''): string {
  if (!tokens || tokens.length === 0) return fallback;
  return tokens.map(t => t.text).join('');
}
