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
  if (candidateList.some(c => c.token === lockedToken)) return candidateList;

  // Token not in analysis results (e.g. was bracketed later) — insert a score-0 placeholder
  // so the UI doesn't lose the locked value from the dropdown.
  return [
    { token: lockedToken, length: 1, support: 0, occurrences: 0, score: 0 },
    ...candidateList,
  ];
}

/**
 * Sort candidates by score (descending), then alphabetically by token.
 */
export function sortCandidatesByScore(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.token ?? '').localeCompare(b.token ?? '');
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
 * Get CSS classes for PT character badge based on lock status.
 */
export function getPTCharBadgeClasses(isLocked: boolean): string {
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
