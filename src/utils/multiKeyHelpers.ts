/**
 * Utilities for working with multi-key (homophone) mode.
 * 
 * These functions help normalize data structures for single-key and multi-key modes.
 */

import type { LockedKeys, SelectionMap } from '../types/domain';

/**
 * Normalize a lock/selection value to an array for consistent processing.
 */
export function normalizeToArray(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return value === '' ? [] : [value];
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
