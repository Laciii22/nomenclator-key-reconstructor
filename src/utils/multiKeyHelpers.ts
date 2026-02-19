/**
 * Utilities for working with multi-key (homophone) mode.
 * 
 * These functions help manage the transition between single-key and multi-key modes,
 * validate selections, and normalize data structures.
 */

import type { LockedKeys, SelectionMap, KeysPerOTMode } from '../types/domain';

/**
 * Type guard: checks if a value is a multi-key array.
 */
export function isMultiKeyValue(value: unknown): value is string[] {
  return Array.isArray(value);
}

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
 * Convert LockedKeys/SelectionMap to the format expected by the current mode.
 * Ensures data structure compatibility when switching between modes.
 * 
 * @param data - Locked keys or selections to convert
 * @param mode - Target mode ('single' or 'multiple')
 * @returns Converted data in the appropriate format
 */
export function convertToMode(
  data: LockedKeys | SelectionMap,
  mode: KeysPerOTMode
): LockedKeys | SelectionMap {
  const result: Record<string, string | string[] | null> = {};
  
  for (const [char, value] of Object.entries(data)) {
    if (mode === 'single') {
      result[char] = normalizeToString(value);
    } else {
      result[char] = normalizeToArray(value);
    }
  }
  
  return result;
}

/**
 * Check if a specific token is assigned to a character.
 * Works with both single-key and multi-key formats.
 * 
 * @param char - OT character to check
 * @param token - ZT token to look for
 * @param data - Locked keys or selections
 * @returns true if token is assigned to the character
 */
export function hasToken(
  char: string,
  token: string,
  data: LockedKeys | SelectionMap
): boolean {
  const value = data[char];
  if (!value) return false;
  
  if (Array.isArray(value)) {
    return value.includes(token);
  }
  return value === token;
}

/**
 * Adds a token to a character's locked/selected tokens (multi-key mode)
 */
export function addToken(
  char: string,
  token: string,
  data: LockedKeys | SelectionMap
): LockedKeys | SelectionMap {
  const current = normalizeToArray(data[char]);
  if (current.includes(token)) return data;
  
  return {
    ...data,
    [char]: [...current, token]
  };
}

/**
 * Removes a token from a character's locked/selected tokens (multi-key mode)
 */
export function removeToken(
  char: string,
  token: string,
  data: LockedKeys | SelectionMap
): LockedKeys | SelectionMap {
  const current = normalizeToArray(data[char]);
  const filtered = current.filter(t => t !== token);
  
  return {
    ...data,
    [char]: filtered.length > 0 ? filtered : null
  };
}

/**
 * Toggles a token for a character (adds if not present, removes if present)
 */
export function toggleToken(
  char: string,
  token: string,
  data: LockedKeys | SelectionMap
): LockedKeys | SelectionMap {
  if (hasToken(char, token, data)) {
    return removeToken(char, token, data);
  }
  return addToken(char, token, data);
}

/**
 * Gets all reserved tokens across all characters (for validation)
 */
export function getReservedTokens(
  lockedKeys: LockedKeys,
  selections: SelectionMap
): Set<string> {
  const reserved = new Set<string>();
  
  const addFromValue = (value: string | string[] | null | undefined) => {
    const tokens = normalizeToArray(value);
    tokens.forEach(t => { if (t) reserved.add(t); });
  };
  
  Object.values(lockedKeys).forEach(addFromValue);
  Object.values(selections).forEach(addFromValue);
  
  return reserved;
}

/**
 * Validates that no token is assigned to multiple different characters in single-key mode
 */
export function validateSingleKeyUniqueness(
  data: LockedKeys | SelectionMap
): { valid: boolean; duplicates: Record<string, string[]> } {
  const tokenToChars: Record<string, string[]> = {};
  
  for (const [char, value] of Object.entries(data)) {
    const token = normalizeToString(value);
    if (!token) continue;
    
    if (!tokenToChars[token]) {
      tokenToChars[token] = [];
    }
    tokenToChars[token].push(char);
  }
  
  const duplicates: Record<string, string[]> = {};
  for (const [token, chars] of Object.entries(tokenToChars)) {
    if (chars.length > 1) {
      duplicates[token] = chars;
    }
  }
  
  return {
    valid: Object.keys(duplicates).length === 0,
    duplicates
  };
}

/**
 * Gets the count of tokens for a character
 */
export function getTokenCount(
  char: string,
  data: LockedKeys | SelectionMap
): number {
  return normalizeToArray(data[char]).length;
}

/**
 * Checks if a character has any tokens
 */
export function hasAnyTokens(
  char: string,
  data: LockedKeys | SelectionMap
): boolean {
  return getTokenCount(char, data) > 0;
}
