import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';

export type AnalysisOptions = {
  keysPerOTMode: KeysPerOTMode;
};

export type Candidate = {
  token: string; // concatenated sequence
  length: number; // number of tokens
  support: number; // how many occurrences match this sequence
  occurrences: number; // how many positions were evaluable for this length
  score: number; // support/occurrences
};

export type CharSuggestion = {
  id: string;
  type: 'char';
  otChar: string; // the plaintext character
  token: string;  // the suggested ZT token sequence (concatenated) representing this char
  support: number; // how many occurrences of the char map to this token
  occurrences: number; // total occurrences of this char
  score: number; // purity/support ratio 0..1
  lockRecommended: boolean;
};

export type AnalysisResult = {
  suggestions: CharSuggestion[];
  proposedLocks: Record<string, string>; // otChar -> token
  proposedRowGroups: number[][]; // adjusted counts per cell
  candidatesByChar: Record<string, Candidate[]>; // all candidates for UI selection
};

function clone2D(arr: number[][]): number[][] {
  return arr.map(r => [...r]);
}

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
function cellStartIndices(rowGroups: number[][]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const row of rowGroups) {
    for (const cnt of row) {
      starts.push(cursor);
      cursor += Math.max(0, cnt || 0);
    }
  }
  return starts;
}

// NOTE: Run-based heuristics removed by request.

// Compute all contiguous segments of length 1..K from the ZT stream, concatenated as strings.
function computeSegments(ztTokens: ZTToken[], K: number): Map<string, { count: number; len: number }> {
  const segs = new Map<string, { count: number; len: number }>();
  for (let i = 0; i < ztTokens.length; i++) {
    let acc = '';
    for (let k = 1; k <= K && i + k <= ztTokens.length; k++) {
      acc += ztTokens[i + k - 1].text;
      const e = segs.get(acc);
      if (e) e.count += 1; else segs.set(acc, { count: 1, len: k });
    }
  }
  return segs;
}

export function analyze(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  rowGroups: number[][],
  _options: AnalysisOptions,
  lockedKeys?: Record<string, string>
): AnalysisResult {
  // Multi-length token sequence heuristic (per-character best sequence of up to K tokens)
  const flatOT = flattenOT(otRows);
  const KMAX = 3; // configurable upper bound
  // Precompute all short segments for length inference and candidate augmentation
  const allSegsTop = computeSegments(ztTokens, KMAX);

  // If there are incoming locked keys, adjust rowGroups to honor their lengths before computing starts
  let workingGroups: number[][] = clone2D(rowGroups);
  if (lockedKeys && Object.keys(lockedKeys).length > 0) {
    // derive locked lengths per char from observed segments if possible
    const lockedLenIncoming: Record<string, number> = {};
    for (const [ch, seq] of Object.entries(lockedKeys)) {
      const len = allSegsTop.get(seq)?.len ?? Math.min(KMAX, Math.max(1, seq.length));
      lockedLenIncoming[ch] = len;
    }

    // apply lengths to matching cells and preserve total count by adjusting unlocked cells
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
  const starts = cellStartIndices(workingGroups);

  // Count occurrences per char and per token
  const charPositions: Record<string, number[]> = {};
  for (let i = 0; i < flatOT.length; i++) {
    const ch = flatOT[i]?.ch;
    if (!ch) continue;
    (charPositions[ch] ||= []).push(i);
  }

  // Suggestions and auto-locks removed; only user-supplied locks are respected.
  const candidatesByChar: Record<string, Candidate[]> = {};

  // For variable-length mapping, evaluate candidate lengths 1..KMAX
  // Build candidates from current starts only (no run-based heuristics)
  for (const [ch, positions] of Object.entries(charPositions)) {
    const cand: Candidate[] = [];

    for (let k = 1; k <= KMAX; k++) {
      const hist = new Map<string, number>();
      let denom = 0;
      for (const idx of positions) {
        const start = starts[idx] ?? 0;
        if (start + k <= ztTokens.length) {
          const seq = ztTokens.slice(start, start + k).map(t => t.text).join('');
          denom++;
          hist.set(seq, (hist.get(seq) || 0) + 1);
        }
      }
      if (denom === 0) continue;
      for (const [seq, count] of hist) {
        const score = count / denom;
        cand.push({ token: seq, length: k, support: count, occurrences: denom, score });
      }
    }

    // If we computed any candidates, sort and store them for the UI
    if (cand.length > 0) {
      // sort candidates by score desc, then support desc, then LONGER length first, then lexicographically
      cand.sort((a, b) => b.score - a.score || b.support - a.support || b.length - a.length || a.token.localeCompare(b.token));
      // dedupe by token string, keep best-scored entry
      const seen = new Set<string>();
      const dedup: Candidate[] = [];
      for (const c of cand) {
        if (seen.has(c.token)) continue;
        seen.add(c.token);
        dedup.push(c);
      }
      candidatesByChar[ch] = dedup;
    }
  }
  // Augmentation: keep only segment-based candidates (no run-based heuristics).

  // Augment: add all short ZT segments (length <= KMAX) observed anywhere in ZT to each char's candidates
  // This ensures options like "23" exist even if current cell starts don't point to them yet.
  for (const [ch, positions] of Object.entries(charPositions)) {
    if (positions.length === 0) continue;
    const occurrences = positions.length;
    const list = candidatesByChar[ch] || [];
    const have = new Set(list.map(c => c.token));
    for (const [seq, info] of allSegsTop) {
      if (info.len > KMAX) continue;
      const support = Math.min(info.count, occurrences);
      const score = occurrences > 0 ? support / occurrences : 0;
      if (!have.has(seq)) list.push({ token: seq, length: info.len, support, occurrences, score });
    }
    list.sort((a, b) => b.score - a.score || b.support - a.support || b.length - a.length || a.token.localeCompare(b.token));
    candidatesByChar[ch] = list;
  }

  // Build proposed rowGroups honoring incoming lockedKeys only (no auto locks)
  const proposed = clone2D(rowGroups);
  const cells = flattenGroups(proposed);
  const flatOT2 = flatOT; // alias

  // First pass: set counts for locked cells to k*(ch)
  let total = 0;
  for (const cell of cells) total += cell.count;
  for (let i = 0; i < cells.length; i++) {
    const ch = flatOT2[i]?.ch;
    if (!ch) continue;
    if (lockedKeys && lockedKeys[ch]) {
      const seq = lockedKeys[ch];
      const k = seq ? (allSegsTop.get(seq)?.len ?? Math.min(KMAX, Math.max(1, seq.length))) : 1;
      const { row, col } = cells[i];
      const cur = proposed[row][col] || 0;
      if (cur !== k) proposed[row][col] = k;
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
    suggestions: [],
    proposedLocks: { ...(lockedKeys || {}) },
    proposedRowGroups: proposed,
    candidatesByChar,
  };
}

export type SelectionMap = Record<string, string | null>; // otChar -> chosen concatenated seq or null for none

// Build new rowGroups by applying desired counts from selections (based on chosen sequence lengths),
// without touching locked characters in selections (caller should exclude them).
export function buildRowGroupsForSelections(
  otRows: OTChar[][],
  _ztTokens: ZTToken[],
  baseRowGroups: number[][],
  selections: SelectionMap,
  candidatesByChar: Record<string, Candidate[]>
): number[][] {
  const proposed = clone2D(baseRowGroups);
  const flatOT = flattenOT(otRows);
  const cells = flattenGroups(proposed);
  // current total equals ztTokens length by construction
  let total = 0;
  for (const cell of cells) total += cell.count;
  const desired: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const ch = flatOT[i]?.ch;
    const cur = cells[i].count;
    if (ch && selections[ch]) {
      const seq = selections[ch] as string;
      const cand = (candidatesByChar[ch] || []).find(c => c.token === seq);
      const len = cand ? cand.length : 1;
      desired.push(len);
    } else {
      desired.push(cur);
    }
  }
  // write desired into proposed
  for (let i = 0; i < cells.length; i++) {
    const { row, col } = cells[i];
    proposed[row][col] = Math.max(0, desired[i] || 0);
  }
  // adjust to preserve total — bias adjustments at the tail and avoid selected cells to keep earlier boundaries stable
  let sumNow = 0;
  for (const row of proposed) for (const v of row) sumNow += (v || 0);
  let delta = total - sumNow; // >0 add tokens, <0 remove tokens

  const isSelected = (i: number) => {
    const ch = flatOT[i]?.ch;
    return ch ? Boolean(selections[ch]) : false;
  };

  const tryAdjust = (dir: 'add' | 'remove') => {
    if ((dir === 'add' && delta <= 0) || (dir === 'remove' && delta >= 0)) return;
    const step = dir === 'add' ? -1 : -1; // iterate from end to start
    for (let i = cells.length - 1; i >= 0 && delta !== 0; i += step) {
      if (isSelected(i)) continue;
      const { row, col } = cells[i];
      const cur = proposed[row][col] || 0;
      if (dir === 'add') {
        proposed[row][col] = cur + 1;
        delta -= 1;
      } else {
        if (cur > 0) {
          proposed[row][col] = cur - 1;
          delta += 1;
        }
      }
    }
  };

  // Prefer removing/adding at the tail among unselected
  tryAdjust('remove');
  tryAdjust('add');
  // As a last resort, allow adjusting any cells from the end
  if (delta !== 0) {
    for (let i = cells.length - 1; i >= 0 && delta !== 0; i--) {
      const { row, col } = cells[i];
      const cur = proposed[row][col] || 0;
      if (delta > 0) { proposed[row][col] = cur + 1; delta -= 1; }
      else if (cur > 0) { proposed[row][col] = cur - 1; delta += 1; }
    }
  }
  return proposed;
}

export function locksFromSelections(selections: SelectionMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ch, seq] of Object.entries(selections)) {
    if (seq) out[ch] = seq;
  }
  return out;
}