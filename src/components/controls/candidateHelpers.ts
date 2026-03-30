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

export function buildCandidateOptionCacheKey(params: {
  c: { token: string; score: number };
  ch: string;
  groupSize: number;
  tokenOccurrences: number[];
  cellFlatIndex: number;
  deceptionCount: number;
  isReservedByOther: boolean;
  selectionArr: string[];
  lockedArr: string[];
}): string {
  const {
    c,
    ch,
    groupSize,
    tokenOccurrences,
    cellFlatIndex,
    deceptionCount,
    isReservedByOther,
    selectionArr,
    lockedArr,
  } = params;

  return [
    ch,
    c.token,
    c.score,
    groupSize,
    cellFlatIndex,
    deceptionCount,
    isReservedByOther ? 1 : 0,
    selectionArr.join(','),
    lockedArr.join(','),
    tokenOccurrences.join(','),
  ].join('|');
}

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
 * Derive soft suggestions per PT char from the current mapping.
 * Only stable (non-tentative) PT->CT cells are considered.
 */
export function buildSuggestedTokensByChar(
  sharedColumns: Column[][],
  effectiveCtTokens: CTToken[],
  lockedKeys?: Record<string, string | string[]>,
): Record<string, string[]> {
  const flatCols: Column[] = [];
  for (const row of sharedColumns) {
    for (const col of row) {
      flatCols.push(col);
    }
  }

  const isCharLocked = (ch: string): boolean => {
    const val = lockedKeys?.[ch];
    if (Array.isArray(val)) return val.length > 0;
    return Boolean(val);
  };

  const anchorIndices: number[] = [];
  for (let i = 0; i < flatCols.length; i++) {
    const col = flatCols[i];
    if (col.pt?.ch && isCharLocked(col.pt.ch)) anchorIndices.push(i);
  }

  const findLeftAnchor = (idx: number): number => {
    let left = -1;
    for (const a of anchorIndices) {
      if (a < idx) left = a;
      else break;
    }
    return left;
  };

  const findRightAnchor = (idx: number): number => {
    for (const a of anchorIndices) {
      if (a > idx) return a;
    }
    return -1;
  };

  const segmentEligible = new Map<string, boolean>();

  const isInsideUnambiguousLockedSegment = (idx: number): boolean => {
    const left = findLeftAnchor(idx);
    const right = findRightAnchor(idx);
    if (left < 0 || right < 0 || right - left <= 1) return false;

    const key = `${left}-${right}`;
    if (segmentEligible.has(key)) return segmentEligible.get(key)!;

    let ok = true;
    for (let j = left + 1; j < right; j++) {
      const col = flatCols[j];
      // Any null/deception or tentative cell means this segment is ambiguous.
      if (!col.pt || col.deception || col.tentative) {
        ok = false;
        break;
      }
    }

    segmentEligible.set(key, ok);
    return ok;
  };

  // PT cells inside an overloaded lock-anchor segment are ambiguous.
  const blockedPtCellIndices = new Set<number>();
  for (let i = 0; i + 1 < anchorIndices.length; i++) {
    const left = anchorIndices[i];
    const right = anchorIndices[i + 1];
    if (right - left <= 1) continue;

    let hasDeceptionInside = false;
    for (let j = left + 1; j < right; j++) {
      const col = flatCols[j];
      if (!col.pt || col.deception) {
        hasDeceptionInside = true;
        break;
      }
    }
    if (!hasDeceptionInside) continue;

    for (let j = left + 1; j < right; j++) {
      const col = flatCols[j];
      if (col.pt && !col.deception && !isCharLocked(col.pt.ch)) {
        blockedPtCellIndices.add(j);
      }
    }
  }

  const byChar = new Map<string, Set<string>>();

  for (let i = 0; i < flatCols.length; i++) {
    const col = flatCols[i];
    if (blockedPtCellIndices.has(i)) continue;
    if (!col.pt || col.deception || col.tentative || !col.ct || col.ct.length === 0) continue;
    if (!isInsideUnambiguousLockedSegment(i)) continue;

    const token = col.ct.map(idx => effectiveCtTokens[idx]?.text ?? '').join('');
    if (!token) continue;

    if (!byChar.has(col.pt.ch)) byChar.set(col.pt.ch, new Set<string>());
    byChar.get(col.pt.ch)!.add(token);
  }

  const out: Record<string, string[]> = {};
  for (const [ch, tokens] of byChar.entries()) {
    out[ch] = Array.from(tokens);
  }
  return out;
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
  /** Optional cache map to skip recomputing equivalent options. */
  _cache?: Map<string, CandidateOption>;
  /** Optional prebuilt cache key. */
  _cacheKey?: string;
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

  const cache = params._cache;
  const cacheKey = params._cacheKey ?? buildCandidateOptionCacheKey({
    c,
    ch,
    groupSize,
    tokenOccurrences,
    cellFlatIndex,
    deceptionCount,
    isReservedByOther,
    selectionArr,
    lockedArr,
  });

  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

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
  
  const result: CandidateOption = {
    token: c.token,
    disabled,
    title,
    label: `${c.token}${scoreStr}${isLocked ? ' (locked)' : ''}`,
    score: c.score,
  };

  if (cache) cache.set(cacheKey, result);
  return result;
}
