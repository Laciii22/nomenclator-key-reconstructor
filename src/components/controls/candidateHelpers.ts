import { buildOccMap } from '../../utils/parseStrategies';
import type { CTToken, PTChar } from '../../types/domain';
import type { Column } from '../types';

export type CandidateOption = {
  token: string;
  disabled: boolean;
  title?: string;
  label: string;
  score: number;
};

/**
 * Build a fast lookup map: PT char -> first flat index in the rendered PT grid.
 * Empty PT cells are ignored (same indexing rule as computeFlatIndexForChar).
 */
export function buildPTCharFlatIndexMap(ptRows: PTChar[][]): Record<string, number> {
  const map: Record<string, number> = {};
  let idx = 0;

  for (const row of ptRows) {
    for (const cell of row) {
      if (cell.ch === '') continue;
      if (map[cell.ch] == null) map[cell.ch] = idx;
      idx++;
    }
  }

  return map;
}

/**
 * Find the flat index of the first occurrence of a character in PT rows.
 * Excludes empty cells from indexing.
 */
export function computeFlatIndexForChar(ptRows: PTChar[][], ch: string): number {
  let idx = 0;
  
  for (const row of ptRows) {
    for (const cell of row) {
      if (cell.ch !== '') {
        if (cell.ch === ch) return idx;
        idx++;
      }
    }
  }
  
  return -1;
}

/**
 * Count total deception tokens in the entire grid.
 */
export function countTotalDeceptionTokens(sharedColumns: Column[][]): number {
  let total = 0;
  for (const row of sharedColumns)
    for (const col of row)
      if (!col.pt) total += col.ct?.length ?? 0;
  return total;
}

/**
 * Check if token position is valid based on expected PT character position.
 * Accounts for deception tokens which can shift expected positions.
 */
function isTokenPositionValid(
  tokenOccurrences: number[],
  expectedPosition: number,
  groupSize: number,
  deceptionCount: number
): boolean {
  if (tokenOccurrences.length === 0) {
    // Token does not exist in CT stream - allow as manual override
    return true;
  }
  
  if (groupSize === 1) {
    // Separator mode: check if any occurrence is within deception tolerance
    return tokenOccurrences.some(i =>
      Math.abs(i - expectedPosition) <= deceptionCount
    );
  }
  
  // Fixed-length mode: expected position is in groups
  const expectedStart = expectedPosition * groupSize;
  return tokenOccurrences.some(i =>
    Math.abs(i - expectedStart) <= deceptionCount
  );
}

/**
 * Build a candidate option with validation and metadata.
 */
export function buildCandidateOptions(params: {
  c: { token: string; score: number; length?: number };
  idx: number;
  ch: string;
  ptRows: PTChar[][];
  effectiveCtTokens: CTToken[];
  groupSize: number;
  reservedTokens: Set<string>;
  selectionVal: string | string[] | null | undefined;
  lockedVal: string | string[] | undefined;
  sharedColumns: Column[][];
  /** Precomputed occurrence map — avoids recomputing per candidate. */
  _occMap?: Record<string, number[]>;
  /** Precomputed PT char -> first flat index map. */
  _ptCharFlatIndexMap?: Record<string, number>;
  /** Precomputed deception token count for this grid snapshot. */
  _deceptionCount?: number;
}): CandidateOption {
  const {
    c,
    ch,
    ptRows,
    effectiveCtTokens,
    groupSize,
    reservedTokens,
    selectionVal,
    lockedVal,
    sharedColumns
  } = params;
  
  // Normalize to arrays for comparison
  const selectionArr = Array.isArray(selectionVal) ? selectionVal : (selectionVal ? [selectionVal] : []);
  const lockedArr = Array.isArray(lockedVal) ? lockedVal : (lockedVal ? [lockedVal] : []);
  
  const isReservedByOther = 
    reservedTokens.has(c.token) && 
    !selectionArr.includes(c.token) && 
    !lockedArr.includes(c.token);
  
  const cellFlatIndex = params._ptCharFlatIndexMap?.[ch] ?? computeFlatIndexForChar(ptRows, ch);
  const occMap = params._occMap ?? buildOccMap(effectiveCtTokens, groupSize);
  const tokenOccurrences = occMap[c.token] || [];
  
  const deceptionCount = params._deceptionCount ?? countTotalDeceptionTokens(sharedColumns);
  const hasInvalidPosition = !isTokenPositionValid(
    tokenOccurrences,
    cellFlatIndex,
    groupSize,
    deceptionCount
  );

  const disabled = isReservedByOther || hasInvalidPosition;
  const scoreStr = ` (score: ${c.score.toFixed(2)})`;
  
  let title: string | undefined;
  if (isReservedByOther) {
    title = 'This token is already used for another character';
  } else if (hasInvalidPosition) {
    if (groupSize === 1) {
      title = 'Token must start at index 0 for the first PT character';
    } else {
      title = `Token must start at index ${cellFlatIndex * groupSize} for position ${cellFlatIndex}`;
    }
  }

  const isLocked = lockedArr.includes(c.token);
  
  return {
    token: c.token,
    disabled,
    title,
    label: `${c.token}${scoreStr}${isLocked ? ' (locked)' : ''}`,
    score: c.score,
  };
}
