/**
 * Parser for fixed-length cipher text.
 * 
 * Splits the raw text into fixed-size character groups.
 * Validates that the text length is compatible with the group size.
 */

import type { ZTToken } from '../../types/domain';

/**
 * Parse raw cipher text using fixed-length grouping.
 * 
 * @param raw The raw cipher text (all characters)
 * @param groupSize Number of characters per group
 * @param otCount Number of OT characters (for validation)
 * @returns Parsed tokens and validation status
 */
export function parseFixedRaw(raw: string, groupSize: number, otCount: number) {
  const s = raw.trim();
  if (!s) return { tokens: [] as ZTToken[], klamacStatus: 'none' as const, statusMessage: null as string | null };
  const size = groupSize > 0 ? groupSize : 1;

  // Filter out spaces from the input (but keep other characters as-is).
  // Build tokens directly to avoid allocating intermediate arrays on each keystroke.
  const tokens: ZTToken[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') continue;
    tokens.push({ id: `zt_${tokens.length}`, text: ch });
  }

  const groupsCount = Math.floor(tokens.length / size);
  const leftover = tokens.length % size;
  let klamacStatus: 'none' | 'needsKlamac' | 'ok' | 'invalid' = 'none';
  let statusMessage: string | null = null;
  if (groupsCount === 0 || otCount === 0) { klamacStatus = 'none'; statusMessage = null; }
  else if (leftover !== 0) { klamacStatus = 'invalid'; statusMessage = `Incomplete group: missing ${size - leftover} character(s) for the last group.`; }
  else if (groupsCount > otCount) { klamacStatus = 'needsKlamac'; statusMessage = `Warning: OT (${otCount}) < ZT groups (${groupsCount}). Choose deception tokens.`; }
  else if (groupsCount < otCount) { klamacStatus = 'invalid'; statusMessage = `OT (${otCount}) > ZT groups (${groupsCount}). Text may be corrupted.`; }
  else { klamacStatus = 'ok'; statusMessage = null; }
  return { tokens, klamacStatus, statusMessage };
}
