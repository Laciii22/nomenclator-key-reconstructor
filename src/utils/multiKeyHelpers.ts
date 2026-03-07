/**
 * Utilities for working with multi-key (homophone) mode.
 * 
 * These functions help normalize data structures for single-key and multi-key modes.
 */

import type { LockedKeys, SelectionMap } from '../types/domain';

/**
 * Normalize a lock/selection value to an array for consistent processing.
 * 
 * @param value - Single token, array of tokens, or null/undefined
 * @returns Array of tokens (empty if input is null/undefined)
 */
export function normalizeToArray(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return value === '' ? [] : [value];
}

/**
 * Normalize a lock/selection value to a single string for single-key mode.
 * Takes the first element if input is an array.
 * 
 * @param value - Single token, array of tokens, or null/undefined
 * @returns Single token string (empty if input is null/undefined or empty array)
 */
export function normalizeToString(value: string | string[] | null | undefined): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value[0] || '';
  return value;
}

/**
 * Gets all reserved tokens across all characters (for validation)
 */
export function getReservedTokens(
  lockedKeys: LockedKeys,
  selections: SelectionMap
): Set<string> {
  const reserved = new Set<string>();
  for (const v of [...Object.values(lockedKeys), ...Object.values(selections)]) {
    for (const t of normalizeToArray(v)) if (t) reserved.add(t);
  }
  return reserved;
}
