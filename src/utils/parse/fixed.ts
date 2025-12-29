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
  const parts = Array.from(s);
  const size = groupSize > 0 ? groupSize : 1;
  const groupsCount = Math.floor(parts.length / size);
  const leftover = parts.length % size;
  let klamacStatus: 'none' | 'needsKlamac' | 'ok' | 'invalid' = 'none';
  let statusMessage: string | null = null;
  if (groupsCount === 0 || otCount === 0) { klamacStatus = 'none'; statusMessage = null; }
  else if (leftover !== 0) { klamacStatus = 'invalid'; statusMessage = `Incomplete group: missing ${size - leftover} character(s) for the last group.`; }
  else if (groupsCount > otCount) { klamacStatus = 'needsKlamac'; statusMessage = `Warning: OT (${otCount}) < ZT groups (${groupsCount}). Choose deception tokens.`; }
  else if (groupsCount < otCount) { klamacStatus = 'invalid'; statusMessage = `OT (${otCount}) > ZT groups (${groupsCount}). Text may be corrupted.`; }
  else { klamacStatus = 'ok'; statusMessage = null; }
  const tokens = parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
  return { tokens, klamacStatus, statusMessage };
}
