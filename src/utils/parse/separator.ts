/**
 * Parser for delimiter-separated cipher text.
 * 
 * Splits the raw text by a separator character/string.
 * Validates that the token count matches the PT character count.
 */

import type { CTToken } from '../../types/domain';

/**
 * Parse raw cipher text using delimiter separation.
 * 
 * @param raw The raw cipher text
 * @param separator The delimiter between tokens
 * @param ptCount Number of PT characters (for validation)
 * @returns Parsed tokens and validation status
 */
export function parseSeparatorRaw(raw: string, separator: string, ptCount: number) {
  const s = raw.trim();
  if (!s) return { tokens: [] as CTToken[], klamacStatus: 'none' as const, statusMessage: null as string | null };
  const parts = s.split(separator).map(p => p.trim()).filter(Boolean);
  let klamacStatus: 'none' | 'needsKlamac' | 'ok' | 'invalid' = 'none';
  let statusMessage: string | null = null;
  if (parts.length === 0 || ptCount === 0) { klamacStatus = 'none'; statusMessage = null; }
  else if (parts.length > ptCount) { klamacStatus = 'needsKlamac'; statusMessage = `Warning: PT (${ptCount}) < CT tokens (${parts.length}). Choose deception tokens.`; }
  else if (parts.length < ptCount) { klamacStatus = 'invalid'; statusMessage = `PT (${ptCount}) > CT tokens (${parts.length}). Text may be corrupted.`; }
  else { klamacStatus = 'ok'; statusMessage = null; }
  const tokens = parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
  return { tokens, klamacStatus, statusMessage };
}
