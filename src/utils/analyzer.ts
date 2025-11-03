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

// Given rowGroups, derive for each cell the single token assigned (if count>=1),
// by following the sequential assignment order through ztTokens.
// Keep a reference implementation for potential weighting; currently unused
// function cellPrimaryToken(
//   rowGroups: number[][],
//   ztTokens: ZTToken[]
// ): (string | null)[] {
//   const primary: (string | null)[] = [];
//   let cursor = 0;
//   for (const row of rowGroups) {
//     for (const cnt of row) {
//       const k = Math.max(0, cnt || 0);
//       if (k > 0 && cursor < ztTokens.length) {
//         primary.push(ztTokens[cursor]?.text ?? null);
//       } else {
//         primary.push(null);
//       }
//       cursor += k;
//     }
//   }
//   return primary;
// }

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

// Compress consecutive identical ZT tokens into runs
function computeRuns(ztTokens: ZTToken[]): { token: string; length: number; str: string }[] {
  const runs: { token: string; length: number; str: string }[] = [];
  if (ztTokens.length === 0) return runs;
  let cur = ztTokens[0].text;
  let len = 1;
  for (let i = 1; i < ztTokens.length; i++) {
    const t = ztTokens[i].text;
    if (t === cur) {
      len++;
    } else {
      runs.push({ token: cur, length: len, str: cur.repeat(len) });
      cur = t;
      len = 1;
    }
  }
  runs.push({ token: cur, length: len, str: cur.repeat(len) });
  return runs;
}

export function analyze(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  rowGroups: number[][],
  options: AnalysisOptions
): AnalysisResult {
  // Multi-length token sequence heuristic (per-character best sequence of up to K tokens)
  const flatOT = flattenOT(otRows);
  // Derived but not used in the current multi-length heuristic; kept for potential future weighting
  // const primary = cellPrimaryToken(rowGroups, ztTokens);
  const starts = cellStartIndices(rowGroups);

  // Count occurrences per char and per token
  const charPositions: Record<string, number[]> = {};
  for (let i = 0; i < flatOT.length; i++) {
    const ch = flatOT[i]?.ch;
    if (!ch) continue;
    (charPositions[ch] ||= []).push(i);
  }

  const suggestions: CharSuggestion[] = [];
  const locks: Record<string, string> = {};
  const candidatesByChar: Record<string, Candidate[]> = {};

  // For variable-length mapping, evaluate candidate lengths 1..KMAX
  const KMAX = 3; // configurable upper bound
  const lockedLen: Record<string, number> = {};
  for (const [ch, positions] of Object.entries(charPositions)) {
    // Even if a character occurs only once, we still want to compute its candidates
    // so the UI can offer options like "22" or "234". However, suggestions/locks
    // are only meaningful when we have multiple occurrences to infer from.
    const computeSuggestion = positions.length >= 2;

    let bestSeq = '';
    let bestLen = 1;
    let bestCount = 0;
    let bestDenom = positions.length;
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
      // track best-by-score to produce a suggestion when applicable
      if (computeSuggestion) {
        // pick top sequence for this k
        let topSeq = '';
        let topCount = 0;
        for (const [seq, c] of hist) {
          if (c > topCount) {
            topCount = c;
            topSeq = seq;
          }
        }
        const topScore = topCount / denom;
        const curBestScore = bestDenom > 0 ? bestCount / bestDenom : -1;
        if (
          topScore > curBestScore ||
          (Math.abs(topScore - curBestScore) < 1e-9 && (topCount > bestCount || (topCount === bestCount && k > bestLen)))
        ) {
          bestSeq = topSeq;
          bestLen = k;
          bestCount = topCount;
          bestDenom = denom;
        }
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

    // Emit an auto suggestion only when we have enough evidence (>=2 occurrences)
    if (computeSuggestion && bestSeq) {
      const occurrences = bestDenom; // positions that had sufficient tokens for bestLen
      const score = occurrences > 0 ? bestCount / occurrences : 0;
      const lockRecommended = options.keysPerOTMode === 'single' && bestCount >= 2 && score >= 0.8;
      suggestions.push({
        id: `sg_${ch}`,
        type: 'char',
        otChar: ch,
        token: bestSeq,
        support: bestCount,
        occurrences,
        score,
        lockRecommended,
      });
      if (lockRecommended) {
        locks[ch] = bestSeq;
        lockedLen[ch] = bestLen;
      }
    }
  }

  // Run-length alignment heuristic: if number of runs matches number of OT cells, align 1 run per cell
  const flatOTCells = flatOT.filter(x => x && x.ch !== '');
  const runs = computeRuns(ztTokens);
  // Global run histogram across entire ZT stream (token^length)
  const runHist = new Map<string, { count: number; len: number }>();
  for (const r of runs) {
    const key = r.str;
    const entry = runHist.get(key);
    if (entry) entry.count += 1; else runHist.set(key, { count: 1, len: r.length });
  }
  if (runs.length === flatOTCells.length && flatOTCells.length > 0) {
    const perCharCounts = new Map<string, Map<string, number>>();
    for (let i = 0; i < runs.length; i++) {
      const ch = flatOTCells[i]!.ch;
      const seq = runs[i].str;
      if (!perCharCounts.has(ch)) perCharCounts.set(ch, new Map());
      const m = perCharCounts.get(ch)!;
      m.set(seq, (m.get(seq) || 0) + 1);
    }
    for (const [ch, counts] of perCharCounts) {
      const positions = charPositions[ch] || [];
      if (positions.length < 2) continue;
      // pick best by count; occurrences equals positions.length
      let topSeq = '';
      let topCount = 0;
      for (const [seq, c] of counts) {
        if (c > topCount) { topCount = c; topSeq = seq; }
      }
      const occurrences = positions.length;
      const score = occurrences > 0 ? topCount / occurrences : 0;
      const lockRecommended = options.keysPerOTMode === 'single' && topCount >= 2 && score >= 0.8;
      // add/merge candidate into candidatesByChar
      const len = topSeq.length;
      const list = candidatesByChar[ch] || [];
      list.push({ token: topSeq, length: len, support: topCount, occurrences, score });
  list.sort((a, b) => b.score - a.score || b.support - a.support || b.length - a.length);
      candidatesByChar[ch] = list;
      // if this beats existing suggestion, replace and set lock
      const existingIdx = suggestions.findIndex(s => s.otChar === ch);
      if (existingIdx >= 0) {
        const cur = suggestions[existingIdx];
        const better = (score > cur.score) || (Math.abs(score - cur.score) < 1e-9 && topCount > cur.support);
        if (better) {
          suggestions[existingIdx] = { id: cur.id, type: 'char', otChar: ch, token: topSeq, support: topCount, occurrences, score, lockRecommended };
          if (lockRecommended) { locks[ch] = topSeq; lockedLen[ch] = len; }
        }
      } else {
        suggestions.push({ id: `sg_rl_${ch}`, type: 'char', otChar: ch, token: topSeq, support: topCount, occurrences, score, lockRecommended });
        if (lockRecommended) { locks[ch] = topSeq; lockedLen[ch] = len; }
      }
    }
  }

  // Global run-based candidates fallback: only apply if a character ended with no candidates
  // This avoids polluting all characters with an irrelevant "most common run" token.
  for (const [ch, positions] of Object.entries(charPositions)) {
    if (positions.length === 0) continue;
    if (candidatesByChar[ch] && candidatesByChar[ch].length > 0) continue;
    let topSeq = '';
    let topCount = 0;
    let topLen = 1;
    for (const [seq, { count, len }] of runHist) {
      if (count > topCount) { topCount = count; topSeq = seq; topLen = len; }
    }
    if (!topSeq) continue;
    const occurrences = positions.length;
    const support = Math.min(topCount, occurrences);
    const score = occurrences > 0 ? support / occurrences : 0;
    const list = candidatesByChar[ch] || [];
    list.push({ token: topSeq, length: topLen, support, occurrences, score });
  list.sort((a, b) => b.score - a.score || b.support - a.support || b.length - a.length || a.token.localeCompare(b.token));
    candidatesByChar[ch] = list;
  }

  // Augment: add repeated-token run sequences (like "22", "333") as candidates for all chars
  // if they exist in the ZT stream and length <= KMAX. This enables selecting patterns like 22
  // even when current starts do not show them for that char yet.
  for (const [ch, positions] of Object.entries(charPositions)) {
    if (positions.length === 0) continue;
    const occurrences = positions.length;
    const list = candidatesByChar[ch] || [];
    const have = new Set(list.map(c => c.token));
    for (const [seq, info] of runHist) {
      if (info.len > KMAX) continue;
      // runHist keys are built as token.repeat(len), thus represent repeated-token sequences
      if (have.has(seq)) continue;
      const support = Math.min(info.count, occurrences);
      const score = occurrences > 0 ? support / occurrences : 0;
      list.push({ token: seq, length: info.len, support, occurrences, score });
    }
    list.sort((a, b) => b.score - a.score || b.support - a.support || b.length - a.length || a.token.localeCompare(b.token));
    candidatesByChar[ch] = list;
  }

  // Build proposed rowGroups: set locked chars to exactly 1 token per cell
  const proposed = clone2D(rowGroups);
  const cells = flattenGroups(proposed);
  const flatOT2 = flatOT; // alias

  // First pass: set counts for locked cells to k*(ch)
  let total = 0;
  for (const cell of cells) total += cell.count;
  for (let i = 0; i < cells.length; i++) {
    const ch = flatOT2[i]?.ch;
    if (!ch) continue;
    if (locks[ch]) {
      const k = lockedLen[ch] || 1;
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
    const locked = ch ? Boolean(locks[ch]) : false;
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
    suggestions: suggestions.sort((a, b) => b.score - a.score),
    proposedLocks: locks,
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

// Generate candidates for a single OT character based on current allocation (rowGroups)
// Evaluates sequences of length 1..KMAX starting at each occurrence's start index
// getCandidatesForChar was used by the removed "Lock one OT" UI; that UI is gone, and
// per-char candidates are already available in analyze() via candidatesByChar.
