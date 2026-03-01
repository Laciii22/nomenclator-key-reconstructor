/**
 * Analysis engine for suggesting PT→CT mappings based on frequency analysis.
 *
 * The analyzer compares PT character frequencies with CT token frequencies
 * and proposes candidate mappings using a similarity score.
 */

import type { PTChar, CTToken, KeysPerPTMode } from '../types/domain';
import {
  countPtFrequency,
  countTokenFrequency,
  scoreRatio,
  flattenPtChars,
  buildCharPositionMap,
  buildTokenPositionMap,
  normalizeLocks,
} from './frequency';

// Re-export scoreRatio for any external consumer
export { scoreRatio } from './frequency';

// SelectionMap is the canonical domain type; re-exported here for backward compatibility.
export type { SelectionMap } from '../types/domain';

/**
 * Options for the analysis algorithm.
 */
export type AnalysisOptions = {
  /** Whether each PT char can map to single or multiple CT tokens */
  keysPerPTMode: KeysPerPTMode;
  /** Size of token groups in fixed-length mode (1 for separator mode) */
  groupSize?: number;
};

/**
 * A candidate CT token for a specific PT character,
 * with confidence scoring based on frequency analysis.
 */
export type Candidate = {
  /** The cipher token value */
  readonly token: string;
  /** Number of tokens in this sequence (always 1 for current implementation) */
  readonly length: number;
  /** How many times this token appears in the cipher text */
  readonly support: number;
  /** How many times the PT character appears */
  readonly occurrences: number;
  /** Confidence score (0-1): similarity of frequencies */
  readonly score: number;
};

/**
 * Result of frequency analysis, containing suggested mappings and candidates.
 */
export type AnalysisResult = {
  /** Suggested PT→CT locks (includes existing locked keys, single-key: string, multi-key: string[]) */
  proposedLocks: Record<string, string | string[]>;
  /** Adjusted token allocation counts per grid cell */
  proposedRowGroups: number[][];
  /** All candidate tokens for each PT character, sorted by score */
  candidatesByChar: Record<string, Candidate[]>;
};

/** Column-like structure for fixed-mode scoring. */
type ColumnLike = { pt: { ch: string } | null; ct: number[] }[][];

/**
 * Precomputed grid context for batch fixed-mode scoring.
 * Build once with `buildFixedModeGridContext`, then pass to
 * `fixedModeScore` via `_gridCtx` to avoid redundant traversals.
 */
export type FixedModeGridContext = {
  readonly groupTextByPos: readonly string[];
  readonly ptCharPositions: Readonly<Record<string, readonly number[]>>;
  readonly mappedTokensByChar: Readonly<Record<string, ReadonlySet<string>>>;
  readonly ptCellCount: number;
  readonly cellsWithText: number;
};

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

export function separatorModeScore(params: {
  token: string;
  ptChar: string;
  ptRows: PTChar[][];
  effectiveCtTokens: CTToken[];
  /** Optional precomputed frequency maps for batch performance. */
  _precomputed?: {
    readonly ptFreq: ReadonlyMap<string, number>;
    readonly tokenFreq: ReadonlyMap<string, number>;
  };
}): { support: number; occurrences: number; score: number } {
  const { token, ptChar, ptRows, effectiveCtTokens, _precomputed } = params;
  const ptFreq = _precomputed?.ptFreq ?? countPtFrequency(ptRows);
  const tokenFreq = _precomputed?.tokenFreq ?? countTokenFrequency(effectiveCtTokens);
  const occurrences = ptFreq.get(ptChar) ?? 0;
  const support = tokenFreq.get(token) ?? 0;
  return { support, occurrences, score: scoreRatio(support, occurrences) };
}

/**
 * Traverse the grid once to extract positions, frequencies, and mapped tokens.
 * Build once and pass to `fixedModeScore` via `_gridCtx` for batch scoring.
 */
export function buildFixedModeGridContext(
  columns: ColumnLike,
  effectiveCtTokens: readonly CTToken[],
): FixedModeGridContext {
  let ptCellCount = 0;
  let cellsWithText = 0;
  const ptCharPositions: Record<string, number[]> = {};
  const mappedTokensByChar: Record<string, Set<string>> = {};
  const groupTextByPos: string[] = [];

  let flatIndex = 0;
  for (const row of columns) {
    for (const col of row) {
      const groupText = (col.ct && col.ct.length > 0)
        ? col.ct.map((i: number) => effectiveCtTokens[i]?.text || '').join('')
        : '';
      groupTextByPos[flatIndex] = groupText;
      if (groupText) cellsWithText++;

      if (col.pt && col.pt.ch !== '') {
        ptCellCount++;
        const ch = col.pt.ch;
        (ptCharPositions[ch] ||= []).push(flatIndex);
        if (groupText) (mappedTokensByChar[ch] ||= new Set()).add(groupText);
      }

      flatIndex++;
    }
  }

  return { groupTextByPos, ptCharPositions, mappedTokensByChar, ptCellCount, cellsWithText };
}

export function fixedModeScore(params: {
  token: string;
  ptChar: string;
  columns: ColumnLike;
  effectiveCtTokens: CTToken[];
  groupSize: number;
  keysPerPTMode?: KeysPerPTMode;
  /** Optional precomputed grid context for batch performance. */
  _gridCtx?: FixedModeGridContext;
}): { support: number; occurrences: number; score: number } {
  const { token, ptChar, columns, effectiveCtTokens, _gridCtx } = params;
  const ctx = _gridCtx ?? buildFixedModeGridContext(columns, effectiveCtTokens);
  const { groupTextByPos, ptCharPositions, mappedTokensByChar, ptCellCount, cellsWithText } = ctx;

  // Find all positions where this token appears in the current shifted grid.
  const tokenPositions: number[] = [];
  for (let pos = 0; pos < groupTextByPos.length; pos++) {
    if (groupTextByPos[pos] === token) tokenPositions.push(pos);
  }

  if ((mappedTokensByChar[ptChar] as ReadonlySet<string> | undefined)?.has(token)) {
    const charPositions = ptCharPositions[ptChar] || [];
    return {
      support: tokenPositions.length,
      occurrences: charPositions.length,
      score: scoreRatio(tokenPositions.length, charPositions.length),
    };
  }

  const deceptionCount = Math.max(0, cellsWithText - ptCellCount);
  const charPositions = ptCharPositions[ptChar] || [];
  const occurrences = charPositions.length;
  const support = tokenPositions.length;

  if (deceptionCount === 0) {
    return { support, occurrences, score: scoreRatio(support, occurrences) };
  }

  const isInRange = tokenPositions.some(tp =>
    charPositions.some(cp => Math.abs(tp - cp) <= deceptionCount)
  );

  if (!isInRange) {
    return { support: 0, occurrences, score: 0 };
  }

  return { support, occurrences, score: scoreRatio(support, occurrences) };
}

// ---------------------------------------------------------------------------
// Internal analysis helpers (extracted from analyze() for readability)
// ---------------------------------------------------------------------------

/** A flat cell with its grid coordinates and token count. */
type FlatCell = { readonly row: number; readonly col: number; readonly count: number };

/** Flatten 2D row groups into cells with coordinates and counts. */
function flattenGroups(rowGroups: readonly number[][]): FlatCell[] {
  const cells: FlatCell[] = [];
  for (let r = 0; r < rowGroups.length; r++) {
    const row = rowGroups[r] || [];
    for (let c = 0; c < row.length; c++) {
      cells.push({ row: r, col: c, count: row[c] || 0 });
    }
  }
  return cells;
}

/** Set locked cell counts to their known token lengths. */
function applyLockedLengths(
  workingGroups: number[][],
  flat: readonly (PTChar | null)[],
  lockedLen: Readonly<Record<string, number>>,
): void {
  const cells = flattenGroups(workingGroups);
  for (let i = 0; i < cells.length; i++) {
    const ch = flat[i]?.ch;
    if (ch && lockedLen[ch] != null) {
      workingGroups[cells[i].row][cells[i].col] = lockedLen[ch];
    }
  }
}

/** Redistribute tokens to preserve total count after locking. */
function balanceGroups(
  workingGroups: number[][],
  total: number,
  flat: readonly (PTChar | null)[],
  lockedLen: Readonly<Record<string, number>> = {},
): void {
  let sumNow = 0;
  for (const row of workingGroups) for (const v of row) sumNow += (v || 0);
  let delta = total - sumNow;
  const cells = flattenGroups(workingGroups);

  for (let i = 0; i < cells.length && delta !== 0; i++) {
    const ch = flat[i]?.ch;
    if (ch && lockedLen[ch] != null) continue;
    const { row, col } = cells[i];
    if (delta > 0) {
      workingGroups[row][col] = (workingGroups[row][col] || 0) + 1;
      delta -= 1;
    } else if (delta < 0) {
      const cur = workingGroups[row][col] || 0;
      if (cur > 0) { workingGroups[row][col] = cur - 1; delta += 1; }
    }
  }

  if (delta !== 0) {
    for (let i = 0; i < cells.length && delta < 0; i++) {
      const { row, col } = cells[i];
      const cur = workingGroups[row][col] || 0;
      if (cur > 0) { workingGroups[row][col] = cur - 1; delta += 1; }
    }
    for (let i = 0; i < cells.length && delta > 0; i++) {
      const { row, col } = cells[i];
      workingGroups[row][col] = (workingGroups[row][col] || 0) + 1;
      delta -= 1;
    }
  }
}

/** Compute candidate score based on frequency ratio. */
function computeCandidateScore(
  cellCount: number,
  tokenCount: number,
  keysPerPTMode: KeysPerPTMode,
): number {
  if (cellCount === 0 && tokenCount === 0) return 0;
  if (keysPerPTMode === 'multiple') {
    return Math.min(tokenCount / cellCount, 1.0);
  }
  return scoreRatio(tokenCount, cellCount);
}

/**
 * Filter tokens to those within +/-deceptionCount range of target PT positions.
 * Uses precomputed token position index for O(1) lookups per token.
 */
function filterTokensByRange(
  tokenPositionMap: ReadonlyMap<string, number[]>,
  uniqueTokens: readonly string[],
  targetPositions: readonly number[],
  deceptionCount: number,
): string[] {
  return uniqueTokens.filter(tok => {
    const positions = tokenPositionMap.get(tok);
    if (!positions) return false;
    return positions.some(tp =>
      targetPositions.some(cp => Math.abs(tp - cp) <= deceptionCount)
    );
  });
}

/** Build candidate token lists for each PT character. */
function buildCandidatesForAnalysis(
  ctTokens: readonly CTToken[],
  charPositions: Readonly<Record<string, readonly number[]>>,
  keysPerPTMode: KeysPerPTMode,
): Record<string, Candidate[]> {
  const uniqueTokens = Array.from(new Set(ctTokens.map(t => t.text)));
  const freq = countTokenFrequency(ctTokens);

  const totalPTChars = Object.values(charPositions).reduce(
    (sum, positions) => sum + positions.length, 0,
  );
  const deceptionCount = ctTokens.length - totalPTChars;

  // Pre-build token position index once for multi-key range filtering
  const tokenPositionMap = keysPerPTMode === 'multiple'
    ? buildTokenPositionMap(ctTokens)
    : null;

  const candidatesByChar: Record<string, Candidate[]> = {};

  for (const ch of Object.keys(charPositions)) {
    const cellPositions = charPositions[ch];
    const cellCount = cellPositions.length;

    const validTokens = tokenPositionMap
      ? filterTokensByRange(tokenPositionMap, uniqueTokens, cellPositions, deceptionCount)
      : uniqueTokens;

    candidatesByChar[ch] = validTokens.map(tok => {
      const tokenCount = freq.get(tok) || 0;
      return {
        token: tok,
        length: 1,
        support: tokenCount,
        occurrences: cellCount,
        score: computeCandidateScore(cellCount, tokenCount, keysPerPTMode),
      };
    });
  }

  return candidatesByChar;
}

/** Build proposed row groups honoring locked keys. */
function buildProposedRowGroups(
  rowGroupsIn: readonly number[][],
  flat: readonly (PTChar | null)[],
  lockedKeysIn?: Readonly<Record<string, string>>,
): number[][] {
  const proposed = rowGroupsIn.map(r => [...r]);
  const cells = flattenGroups(proposed);

  let total = 0;
  for (const cell of cells) total += cell.count;

  for (let i = 0; i < cells.length; i++) {
    const ch = flat[i]?.ch;
    if (ch && lockedKeysIn?.[ch]) {
      proposed[cells[i].row][cells[i].col] = 1;
    }
  }

  let sumNow = 0;
  for (const row of proposed) for (const v of row) sumNow += (v || 0);
  let delta = total - sumNow;

  for (let i = 0; i < cells.length && delta !== 0; i++) {
    const ch = flat[i]?.ch;
    if (ch && lockedKeysIn?.[ch]) continue;
    const { row, col } = cells[i];
    if (delta > 0) {
      proposed[row][col] = (proposed[row][col] || 0) + 1;
      delta -= 1;
    } else if (delta < 0 && (proposed[row][col] || 0) > 0) {
      proposed[row][col] -= 1;
      delta += 1;
    }
  }

  if (delta !== 0) {
    for (let i = 0; i < cells.length && delta < 0; i++) {
      const { row, col } = cells[i];
      const cur = proposed[row][col] || 0;
      if (cur > 0) { proposed[row][col] = cur - 1; delta += 1; }
    }
    for (let i = 0; i < cells.length && delta > 0; i++) {
      const { row, col } = cells[i];
      proposed[row][col] = (proposed[row][col] || 0) + 1;
      delta -= 1;
    }
  }

  return proposed;
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export function analyze(
  ptRows: PTChar[][],
  ctTokens: CTToken[],
  rowGroups: number[][],
  _options: AnalysisOptions,
  lockedKeys?: Record<string, string | string[]>,
): AnalysisResult {
  const flatOT = flattenPtChars(ptRows);
  const normalizedLocks = normalizeLocks(lockedKeys);

  // Adjust rowGroups for locked key lengths
  const workingGroups = rowGroups.map(r => [...r]);
  if (Object.keys(normalizedLocks).length > 0) {
    const lockedLen: Record<string, number> = {};
    for (const ch of Object.keys(normalizedLocks)) lockedLen[ch] = 1;

    const cells = flattenGroups(workingGroups);
    let total = 0;
    for (const cell of cells) total += cell.count;

    applyLockedLengths(workingGroups, flatOT, lockedLen);
    balanceGroups(workingGroups, total, flatOT, lockedLen);
  }

  const charPositions = buildCharPositionMap(flatOT);
  const candidatesByChar = buildCandidatesForAnalysis(ctTokens, charPositions, _options.keysPerPTMode);
  const proposed = buildProposedRowGroups(rowGroups, flatOT, normalizedLocks);

  return {
    proposedLocks: { ...(lockedKeys || {}) },
    proposedRowGroups: proposed,
    candidatesByChar,
  };
}

