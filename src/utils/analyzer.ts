
import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';

// SelectionMap: mapuje OT znak na vybraný ZT token (nebo null)
export type SelectionMap = Record<string, string | null>;

export type AnalysisOptions = {
  keysPerOTMode: KeysPerOTMode;
};

export type Candidate = {
  token: string; // single token value
  length: number; // always 1 (number of tokens)
  support: number; // how many times this token appears in ZT
  occurrences: number; // total ZT token count
  score: number; // support/occurrences ratio
};

export type AnalysisResult = {
  proposedLocks: Record<string, string>; // otChar -> token
  proposedRowGroups: number[][]; // adjusted counts per cell
  candidatesByChar: Record<string, Candidate[]>; // all candidates for UI selection
};

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
  lockedKeys?: Record<string, string>
): AnalysisResult {
  // Multi-length token sequence heuristic (per-character best sequence of up to K tokens)
  const flatOT = flattenOT(otRows);

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

  function buildCandidates(ztTokens: ZTToken[], charPositions: Record<string, number[]>) {
    const uniqueTokens = Array.from(new Set(ztTokens.map(t => t.text)));
    const freq: Record<string, number> = {};
    for (const t of ztTokens) freq[t.text] = (freq[t.text] || 0) + 1;
    const candidatesByChar: Record<string, Candidate[]> = {};
    for (const ch of Object.keys(charPositions)) {
      const cellCount = charPositions[ch].length; // počet buniek pre tento OT znak
      candidatesByChar[ch] = uniqueTokens.map(tok => {
        const tokenCount = freq[tok] || 0;
        let score = 0;
        if (cellCount > 0 || tokenCount > 0) {
          score = Math.min(tokenCount, cellCount) / Math.max(tokenCount, cellCount);
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
  if (lockedKeys && Object.keys(lockedKeys).length > 0) {
    const lockedLenIncoming: Record<string, number> = {};
    for (const [ch] of Object.entries(lockedKeys)) lockedLenIncoming[ch] = 1;
    const cells = flattenGroups(workingGroups);
    let total = 0;
    for (const cell of cells) total += cell.count;
    applyLockedLengths(workingGroups, flatOT, lockedLenIncoming);
    balanceGroups(workingGroups, total, flatOT, lockedLenIncoming);
  }

  // Count occurrences per char and per token
  const charPositions = computeCharPositions(flatOT);
  const candidatesByChar = buildCandidates(ztTokens, charPositions);

  // Build proposed rowGroups honoring incoming lockedKeys only (no auto locks)
  const proposed = buildProposedRowGroups(rowGroups, flatOT, lockedKeys);

  return {
    proposedLocks: { ...(lockedKeys || {}) },
    proposedRowGroups: proposed,
    candidatesByChar,
  };
}

