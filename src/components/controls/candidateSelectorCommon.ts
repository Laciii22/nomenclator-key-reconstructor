/**
 * Common utilities shared across all candidate selector components
 * (Fixed, Separator, Multi).
 * 
 * These helpers extract duplicated logic for:
 * - List preparation and extension
 * - Sorting by score
 * - State normalization
 */

import type { Candidate } from '../../utils/analyzer';

/**
 * Extend candidate list with a locked token if not already present.
 * Ensures locked tokens appear in the UI even if not in analysis results.
 */
export function extendCandidateListWithLocked(
  candidateList: Candidate[],
  lockedToken: string | undefined
): Candidate[] {
  if (!lockedToken) return candidateList;
  
  if (candidateList.some(c => c.token === lockedToken)) {
    return candidateList;
  }
  
  // Add locked token at the beginning with default score
  return [
    {
      token: lockedToken,
      length: 1,
      support: 0,
      occurrences: 0,
      score: 1
    },
    ...candidateList
  ];
}

/**
 * Sort candidates by score (descending), then alphabetically by token.
 */
export function sortCandidatesByScore(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.token.localeCompare(b.token);
  });
}

/**
 * Get the current value for a candidate selector (locked takes priority).
 */
export function getCurrentSelectorValue(
  lockedValue: string | undefined,
  selectionValue: string | string[] | null | undefined
): string {
  if (lockedValue) return lockedValue;
  
  // Normalize selection to string (for compatibility with single-mode selectors)
  if (Array.isArray(selectionValue)) {
    return selectionValue[0] ?? '';
  }
  
  return selectionValue ?? '';
}

/**
 * Check if selector should be disabled (when value is locked).
 */
export function isSelectorDisabled(lockedValue: string | undefined): boolean {
  return Boolean(lockedValue);
}

/**
 * Get CSS classes for OT character badge based on lock status.
 */
export function getOTCharBadgeClasses(isLocked: boolean): string {
  return isLocked
    ? 'bg-green-100 text-green-800 border border-green-300'
    : 'bg-yellow-100 text-yellow-800 border border-yellow-300';
}

/**
 * Get CSS classes for selector input based on disabled state.
 */
export function getSelectorInputClasses(isDisabled: boolean): string {
  return `border border-gray-300 rounded p-1 text-sm flex-1 ${
    isDisabled ? 'bg-green-50 cursor-not-allowed' : ''
  }`;
}
