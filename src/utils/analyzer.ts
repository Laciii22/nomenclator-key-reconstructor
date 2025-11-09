import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';

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

// Build a flat view of cells with row/col and counts
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
// Removed start index computation (no longer used after simplification)

// NOTE: Run-based heuristics removed by request.

// (Removed multi-length segment computation; we only care about single tokens now.)

export function analyze(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  rowGroups: number[][],
  _options: AnalysisOptions,
  lockedKeys?: Record<string, string>
): AnalysisResult {
  // Multi-length token sequence heuristic (per-character best sequence of up to K tokens)
  const flatOT = flattenOT(otRows);

  // If there are incoming locked keys, adjust rowGroups to honor their lengths before computing starts
  const workingGroups: number[][] = clone2D(rowGroups);
  if (lockedKeys && Object.keys(lockedKeys).length > 0) {
    // All locks have length 1 (single token)
    const lockedLenIncoming: Record<string, number> = {};
    for (const [ch] of Object.entries(lockedKeys)) lockedLenIncoming[ch] = 1;

    // apply lengths (1) to matching cells and preserve total count by adjusting unlocked cells
    const cells = flattenGroups(workingGroups);
    const flatOT2 = flatOT;
    let total = 0;
    for (const cell of cells) total += cell.count;
    for (let i = 0; i < cells.length; i++) {
      const ch = flatOT2[i]?.ch;
      if (!ch) continue;
      if (lockedLenIncoming[ch] != null) {
        const { row, col } = cells[i];
        workingGroups[row][col] = lockedLenIncoming[ch];
      }
    }
    // balance
    let sumNow = 0;
    for (const row of workingGroups) for (const v of row) sumNow += (v || 0);
    let delta = total - sumNow; // >0 add tokens; <0 remove tokens
    const cells2 = flattenGroups(workingGroups);
    for (let i = 0; i < cells2.length && delta !== 0; i++) {
      const ch = flatOT2[i]?.ch;
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

  // Compute starts from (possibly) adjusted groups
  // (Starts no longer needed for multi-length inference; keeping rowGroups as-is.)

  // Count occurrences per char and per token
  const charPositions: Record<string, number[]> = {};
  for (let i = 0; i < flatOT.length; i++) {
    const ch = flatOT[i]?.ch;
    if (!ch) continue;
    (charPositions[ch] ||= []).push(i);
  }

  // Build simplified candidates: for EACH OT char list ALL UNIQUE single tokens from ZT.
  const uniqueTokens = Array.from(new Set(ztTokens.map(t => t.text)));
  const totalTokens = ztTokens.length;
  const freq: Record<string, number> = {};
  for (const t of ztTokens) freq[t.text] = (freq[t.text] || 0) + 1;
  const candidatesByChar: Record<string, Candidate[]> = {};
  for (const ch of Object.keys(charPositions)) {
    candidatesByChar[ch] = uniqueTokens.map(tok => ({
      token: tok,
      length: 1,
      support: freq[tok] || 0,
      occurrences: totalTokens,
      score: (freq[tok] || 0) / Math.max(1, totalTokens)
    }));
  }

  // Build proposed rowGroups honoring incoming lockedKeys only (no auto locks)
  const proposed = clone2D(rowGroups);
  const cells = flattenGroups(proposed);
  const flatOT2 = flatOT; // alias

  // First pass: set counts for locked cells to 1 (single token per locked cell)
  let total = 0;
  for (const cell of cells) total += cell.count;
  for (let i = 0; i < cells.length; i++) {
    const ch = flatOT2[i]?.ch;
    if (!ch) continue;
    if (lockedKeys && lockedKeys[ch]) {
      const { row, col } = cells[i];
      const cur = proposed[row][col] || 0;
      if (cur !== 1) proposed[row][col] = 1;
    }
  }

  // Recompute totals and adjust unlocked cells to preserve total token count
  let sumNow = 0;
  for (const row of proposed) for (const v of row) sumNow += (v || 0);
  let delta = total - sumNow; // >0 means we need to add tokens back; <0 means we need to remove

  // Helper: iterate cells in order and modify only UNLOCKED cells
  for (let i = 0; i < cells.length && delta !== 0; i++) {
    const ch = flatOT2[i]?.ch;
    const { row, col } = cells[i];
  const locked = ch ? Boolean(lockedKeys && lockedKeys[ch]) : false;
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

  return {
    proposedLocks: { ...(lockedKeys || {}) },
    proposedRowGroups: proposed,
    candidatesByChar,
  };
}

export type SelectionMap = Record<string, string | null>; // otChar -> chosen concatenated seq or null for none

// Build new rowGroups by applying desired counts from selections (based on chosen sequence lengths),
// without touching locked characters in selections (caller should exclude them).
// Removed buildRowGroupsForSelections (unused after simplification)

export function locksFromSelections(selections: SelectionMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ch, seq] of Object.entries(selections)) {
    if (seq) out[ch] = seq;
  }
  return out;
}