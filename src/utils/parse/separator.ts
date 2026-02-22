/**
 * Parser for delimiter-separated cipher text.
 * 
 * Splits the raw text by a separator character/string.
 * Validates that the token count matches the OT character count.
 */

import type { ZTToken } from '../../types/domain';

/**
 * Parse raw cipher text using delimiter separation.
 * 
 * @param raw The raw cipher text
 * @param separator The delimiter between tokens
 * @param otCount Number of OT characters (for validation)
 * @returns Parsed tokens and validation status
 */
export function parseSeparatorRaw(raw: string, separator: string, otCount: number) {
  const s = raw.trim();
  if (!s) return { tokens: [] as ZTToken[], klamacStatus: 'none' as const, statusMessage: null as string | null };
  const parts = s.split(separator).map(p => p.trim()).filter(Boolean);
  let klamacStatus: 'none' | 'needsKlamac' | 'ok' | 'invalid' = 'none';
  let statusMessage: string | null = null;
  if (parts.length === 0 || otCount === 0) { klamacStatus = 'none'; statusMessage = null; }
  else if (parts.length > otCount) { klamacStatus = 'needsKlamac'; statusMessage = `Warning: OT (${otCount}) < ZT tokens (${parts.length}). Choose deception tokens.`; }
  else if (parts.length < otCount) { klamacStatus = 'invalid'; statusMessage = `OT (${otCount}) > ZT tokens (${parts.length}). Text may be corrupted.`; }
  else { klamacStatus = 'ok'; statusMessage = null; }
  const tokens = parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
  return { tokens, klamacStatus, statusMessage };
}
