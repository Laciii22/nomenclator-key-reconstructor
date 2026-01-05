/**
 * Analysis engine for suggesting OT→ZT mappings based on frequency analysis.
 * 
 * The analyzer compares OT character frequencies with ZT token frequencies
 * and proposes candidate mappings using a similarity score.
 */

import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';
import { computePairsFromColumns } from './columns';

/**
 * Maps each OT character to its selected ZT token (or null if unselected).
 * - In 'single' mode: string | null (one token per character)
 * - In 'multiple' mode: string[] (multiple homophones per character)
 */
export type SelectionMap = Record<string, string | string[] | null>;

/**
 * Options for the analysis algorithm.
 */
export type AnalysisOptions = {
  /** Whether each OT char can map to single or multiple ZT tokens */
  keysPerOTMode: KeysPerOTMode;
  /** Size of token groups in fixed-length mode (1 for separator mode) */
  groupSize?: number;
};

/**
 * A candidate ZT token for a specific OT character,
 * with confidence scoring based on frequency analysis.
 */
export type Candidate = {
  /** The cipher token value */
  token: string;
  /** Number of tokens in this sequence (always 1 for current implementation) */
  length: number;
  /** How many times this token appears in the cipher text */
  support: number;
  /** How many times the OT character appears */
  occurrences: number;
  /** Confidence score (0-1): similarity of frequencies */
  score: number;
};

/**
 * Result of frequency analysis, containing suggested mappings and candidates.
 */
export type AnalysisResult = {
  /** Suggested OT→ZT locks (includes existing locked keys, single-key: string, multi-key: string[]) */
  proposedLocks: Record<string, string | string[]>;
  /** Adjusted token allocation counts per grid cell */
  proposedRowGroups: number[][];
  /** All candidate tokens for each OT character, sorted by score */
  candidatesByChar: Record<string, Candidate[]>;
};

type ColumnLike = { ot: { ch: string } | null; zt: number[] }[][];

function countOtCellsByChar(otRows: OTChar[][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of otRows) {
    for (const cell of row) {
      if (!cell || cell.ch === '') continue;
      out[cell.ch] = (out[cell.ch] || 0) + 1;
    }
  }
  return out;
}

function scoreRatio(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

export function separatorModeScore(params: {
  token: string;
  otChar: string;
  otRows: OTChar[][];
  effectiveZtTokens: ZTToken[];
}): { support: number; occurrences: number; score: number } {
  const { token, otChar, otRows, effectiveZtTokens } = params;
  const otCellCounts = countOtCellsByChar(otRows);
  const occurrences = otCellCounts[otChar] || 0;
  const support = effectiveZtTokens.reduce((acc, t) => acc + (t.text === token ? 1 : 0), 0);
  return { support, occurrences, score: scoreRatio(support, occurrences) };
}

export function fixedModeScore(params: {
  token: string;
  otChar: string;
  columns: ColumnLike;
  effectiveZtTokens: ZTToken[];
  groupSize: number;
  keysPerOTMode?: KeysPerOTMode;
}): { support: number; occurrences: number; score: number } {
  const { token, otChar, columns, effectiveZtTokens, groupSize, keysPerOTMode = 'single' } = params;
  const pairs = computePairsFromColumns(columns, effectiveZtTokens, groupSize, keysPerOTMode);

  const otCellCounts: Record<string, number> = {};
  for (const p of pairs) otCellCounts[p.ot] = (otCellCounts[p.ot] || 0) + 1;

  const tokenCounts: Record<string, number> = {};
  const mappedTokensByChar: Record<string, Set<string>> = {};
  for (const p of pairs) {
    if (!p.zt) continue;
    tokenCounts[p.zt] = (tokenCounts[p.zt] || 0) + 1;
    (mappedTokensByChar[p.ot] ||= new Set()).add(p.zt);
  }

  const occurrences = otCellCounts[otChar] || 0;
  const support = tokenCounts[token] || 0;

  // Mapping-derived candidate for this OT char is high-confidence.
  if (mappedTokensByChar[otChar]?.has(token)) {
    return { support, occurrences, score: 1.0 };
  }

  return { support, occurrences, score: scoreRatio(support, occurrences) };
}

function clone2D(arr: number[][]): number[][] { return arr.map(r => [...r]); }

// Build a flat view of cells with row/col and counts, it makes array of objects
function flattenGroups(rowGroups: number[][]) {
  const cells: { row: number; col: number; count: number }[] = [];
  for (let r = 0; r < rowGroups.length; r++) {
    const row = rowGroups[r] || [];
    for (let c = 0; c < row.length; c++) {
      cells.push({ row: r, col: c, count: row[c] || 0 });
    }
  }
  return cells;
}

// Compute a mapping from each cell index to its OT char (or null)
function flattenOT(otRows: OTChar[][]) {
  // Must mirror computeRowAlloc's filtering (exclude empty placeholders)
  const flat: (OTChar | null)[] = [];
  for (const row of otRows) {
    for (const cell of row) {
      if (cell && cell.ch !== '') flat.push(cell);
    }
  }
  return flat;
}

// Compute flat start index for each cell into the ZT stream

export function analyze(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  rowGroups: number[][],
  _options: AnalysisOptions,
  lockedKeys?: Record<string, string | string[]>
): AnalysisResult {
  // Multi-length token sequence heuristic (per-character best sequence of up to K tokens)
  const flatOT = flattenOT(otRows);
  
  // Normalize locked keys to single-key format for backward compatibility
  // In multi-key mode, we only use the first token for allocation purposes
  const normalizedLocks: Record<string, string> = {};
  if (lockedKeys) {
    for (const [ch, val] of Object.entries(lockedKeys)) {
      if (Array.isArray(val)) {
        if (val.length > 0) normalizedLocks[ch] = val[0];
      } else if (val) {
        normalizedLocks[ch] = val;
      }
    }
  }

  // Helpers extracted from original implementation
  function applyLockedLengths(workingGroups: number[][], flat: (OTChar | null)[], lockedLenIncoming: Record<string, number>) {
    const cells = flattenGroups(workingGroups);
    for (let i = 0; i < cells.length; i++) {
      const ch = flat[i]?.ch;
      if (!ch) continue;
      if (lockedLenIncoming[ch] != null) {
        const { row, col } = cells[i];
        workingGroups[row][col] = lockedLenIncoming[ch];
      }
    }
  }

  function balanceGroups(workingGroups: number[][], total: number, flat: (OTChar | null)[], lockedLenIncoming: Record<string, number> = {}) {
    let sumNow = 0;
    for (const row of workingGroups) for (const v of row) sumNow += (v || 0);
    let delta = total - sumNow; // >0 add tokens; <0 remove tokens
    const cells2 = flattenGroups(workingGroups);
    for (let i = 0; i < cells2.length && delta !== 0; i++) {
      const ch = flat[i]?.ch;
      const { row, col } = cells2[i];
      const isLocked = ch ? lockedLenIncoming[ch] != null : false;
      if (isLocked) continue;
      if (delta > 0) { workingGroups[row][col] = (workingGroups[row][col] || 0) + 1; delta -= 1; }
      else if (delta < 0) {
        const cur = workingGroups[row][col] || 0;
        if (cur > 0) { workingGroups[row][col] = cur - 1; delta += 1; }
      }
    }
    if (delta !== 0) {
      for (let i = 0; i < cells2.length && delta < 0; i++) {
        const { row, col } = cells2[i];
        const cur = workingGroups[row][col] || 0;
        if (cur > 0) { workingGroups[row][col] = cur - 1; delta += 1; }
      }
      for (let i = 0; i < cells2.length && delta > 0; i++) {
        const { row, col } = cells2[i];
        workingGroups[row][col] = (workingGroups[row][col] || 0) + 1; delta -= 1;
      }
    }
  }

  function computeCharPositions(flat: (OTChar | null)[]) {
    const charPositions: Record<string, number[]> = {};
    for (let i = 0; i < flat.length; i++) {
      const ch = flat[i]?.ch;
      if (!ch) continue;
      (charPositions[ch] ||= []).push(i);
    }
    return charPositions;
  }

  function buildCandidates(ztTokens: ZTToken[], charPositions: Record<string, number[]>, keysPerOTMode: KeysPerOTMode, groupSize: number = 1) {
    const uniqueTokens = Array.from(new Set(ztTokens.map(t => t.text)));
    const freq: Record<string, number> = {};
    for (const t of ztTokens) freq[t.text] = (freq[t.text] || 0) + 1;
    
    // Calculate deception count: total ZT tokens minus total OT characters
    // Note: ztTokens here are already logical tokens (after buildLogicalTokens),
    // so the count is already in groups, not individual characters
    const totalOTChars = Object.values(charPositions).reduce((sum, positions) => sum + positions.length, 0);
    const deceptionCount = ztTokens.length - totalOTChars;
    
    const candidatesByChar: Record<string, Candidate[]> = {};
    for (const ch of Object.keys(charPositions)) {
      const cellCount = charPositions[ch].length; // number of cells for this OT character
      const cellPositions = charPositions[ch]; // which positions this character appears at
      
      // In multi-key mode, only consider tokens at positions where this character appears
      // With deception tokens, allow ±deceptionCount offset from character positions
      const validTokens = keysPerOTMode === 'multiple'
        ? uniqueTokens.filter(tok => {
            // Find all positions where this token appears in ZT
            const tokenPositions: number[] = [];
            for (let i = 0; i < ztTokens.length; i++) {
              if (ztTokens[i].text === tok) tokenPositions.push(i);
            }
            // Check if any token position is within ±deceptionCount range of OT character positions
            return tokenPositions.some(tp => 
              cellPositions.some(cp => Math.abs(tp - cp) <= deceptionCount)
            );
          })
        : uniqueTokens;
      
      candidatesByChar[ch] = validTokens.map(tok => {
        const tokenCount = freq[tok] || 0;
        let score = 0;
        if (cellCount > 0 || tokenCount > 0) {
          if (keysPerOTMode === 'multiple') {
            // In multi-key mode: score = 1.0 if token frequency exactly matches how many times
            // we'd expect it as a homophone. E.g., if A appears 3 times and token "11" appears 1 time,
            // it's a perfect candidate if we select 3 different homophones each appearing once.
            // Score represents "fitness" - higher is better
            score = Math.min(tokenCount / cellCount, 1.0);
          } else {
            // Single-key mode: expect 1:1 mapping
            score = Math.min(tokenCount, cellCount) / Math.max(tokenCount, cellCount);
          }
        }
        return {
          token: tok,
          length: 1,
          support: tokenCount,
          occurrences: cellCount,
          score
        };
      });
    }
    return candidatesByChar;
  }

  function buildProposedRowGroups(rowGroupsIn: number[][], flat: (OTChar | null)[], lockedKeysIn?: Record<string, string>) {
    const proposed = clone2D(rowGroupsIn);
    const cells = flattenGroups(proposed);
    // First pass: set counts for locked cells to 1 (single token per locked cell)
    let total = 0;
    for (const cell of cells) total += cell.count;
    for (let i = 0; i < cells.length; i++) {
      const ch = flat[i]?.ch;
      if (!ch) continue;
      if (lockedKeysIn && lockedKeysIn[ch]) {
        const { row, col } = cells[i];
        const cur = proposed[row][col] || 0;
        if (cur !== 1) proposed[row][col] = 1;
      }
    }
    // Recompute totals and adjust unlocked cells to preserve total token count
    let sumNow = 0;
    for (const row of proposed) for (const v of row) sumNow += (v || 0);
    let delta = total - sumNow; // >0 means we need to add tokens back; <0 means we need to remove
    for (let i = 0; i < cells.length && delta !== 0; i++) {
      const ch = flat[i]?.ch;
      const { row, col } = cells[i];
      const locked = ch ? Boolean(lockedKeysIn && lockedKeysIn[ch]) : false;
      if (locked) continue;
      if (delta > 0) {
        proposed[row][col] = (proposed[row][col] || 0) + 1;
        delta -= 1;
      } else if (delta < 0) {
        const cur = proposed[row][col] || 0;
        if (cur > 0) {
          proposed[row][col] = cur - 1;
          delta += 1;
        }
      }
    }
    // If still delta remains (e.g., all unlocked were zero), run another pass allowing any cell >0 to decrease
    if (delta !== 0) {
      for (let i = 0; i < cells.length && delta < 0; i++) {
        const { row, col } = cells[i];
        const cur = proposed[row][col] || 0;
        if (cur > 0) {
          proposed[row][col] = cur - 1;
          delta += 1;
        }
      }
      for (let i = 0; i < cells.length && delta > 0; i++) {
        const { row, col } = cells[i];
        proposed[row][col] = (proposed[row][col] || 0) + 1;
        delta -= 1;
      }
    }
    return proposed;
  }

  // If there are incoming locked keys, adjust rowGroups to honor their lengths before computing starts
  const workingGroups: number[][] = clone2D(rowGroups);
  if (normalizedLocks && Object.keys(normalizedLocks).length > 0) {
    const lockedLenIncoming: Record<string, number> = {};
    for (const [ch] of Object.entries(normalizedLocks)) lockedLenIncoming[ch] = 1;
    const cells = flattenGroups(workingGroups);
    let total = 0;
    for (const cell of cells) total += cell.count;
    applyLockedLengths(workingGroups, flatOT, lockedLenIncoming);
    balanceGroups(workingGroups, total, flatOT, lockedLenIncoming);
  }

  // Count occurrences per char and per token
  const charPositions = computeCharPositions(flatOT);
  const groupSize = _options.groupSize || 1;
  const candidatesByChar = buildCandidates(ztTokens, charPositions, _options.keysPerOTMode, groupSize);

  // Build proposed rowGroups honoring incoming lockedKeys only (no auto locks)
  const proposed = buildProposedRowGroups(rowGroups, flatOT, normalizedLocks);

  return {
    proposedLocks: { ...(lockedKeys || {}) },
    proposedRowGroups: proposed,
    candidatesByChar,
  };
}

