/**
 * Shared test factories for PTChar / CTToken creation.
 *
 * Usage:
 *   beforeEach(() => resetIds());
 *   const rows = [ptRow('A', 'H', 'A')];
 *   const tokens = ctList('11', '22', '11');
 */

import type { PTChar, CTToken } from '../src/types/domain';
import type { AnalysisOptions, AnalysisResult } from '../src/utils/analyzer';

// ---------------------------------------------------------------------------
// Id counters (reset between tests to keep ids deterministic)
// ---------------------------------------------------------------------------
let _ptId = 0;
let _ctId = 0;

export function resetIds(): void {
  _ptId = 0;
  _ctId = 0;
}

// ---------------------------------------------------------------------------
// PT factories
// ---------------------------------------------------------------------------

/** Single PTChar with auto-incremented id. */
export function pt(ch: string): PTChar {
  return { id: `ot_${_ptId++}`, ch };
}

/** One row of PTChars from a list of characters. */
export function ptRow(...chars: string[]): PTChar[] {
  return chars.map(ch => pt(ch));
}

/** PTChar[][] (single row) from a plain string – one char per cell. */
export function ptFromString(s: string): PTChar[][] {
  return [ptRow(...s.split(''))];
}

// ---------------------------------------------------------------------------
// CT factories
// ---------------------------------------------------------------------------

/** Single CTToken with auto-incremented id. */
export function ct(text: string): CTToken {
  return { id: `zt_${_ctId++}`, text };
}

/** Array of CTTokens from a list of text values. */
export function ctList(...texts: string[]): CTToken[] {
  return texts.map(t => ct(t));
}

/** Parse a separator-delimited string into CTTokens. */
export function ctFromRaw(raw: string, sep = ':'): CTToken[] {
  return raw.split(sep).filter(Boolean).map(t => ct(t));
}

// ---------------------------------------------------------------------------
// RowGroups helpers
// ---------------------------------------------------------------------------

/**
 * Build a single-row rowGroups that sums to `total` spread across `cols` columns.
 * First cells absorb the remainder.
 */
export function uniformRowGroups(cols: number, total: number): number[][] {
  const base = Math.floor(total / cols);
  const rem = total % cols;
  return [Array.from({ length: cols }, (_, i) => base + (i < rem ? 1 : 0))];
}

// ---------------------------------------------------------------------------
// Analysis options shorthand
// ---------------------------------------------------------------------------

export const OPTS_SINGLE: AnalysisOptions = { keysPerPTMode: 'single', groupSize: 1 };
export const OPTS_MULTI: AnalysisOptions = { keysPerPTMode: 'multiple', groupSize: 1 };

// ---------------------------------------------------------------------------
// Invariant assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert the fundamental invariants every AnalysisResult must satisfy.
 * Use inside any test that calls `analyze()`.
 */
export function assertAnalysisInvariants(
  result: AnalysisResult,
  ctCount: number,
): void {
  const flat = result.proposedRowGroups.flat();

  // 1. No negative cell counts
  for (const v of flat) {
    if (v < 0) throw new Error(`Negative cell count: ${v}`);
  }

  // 2. Sum of cell counts === total CT tokens
  const sum = flat.reduce((s, v) => s + v, 0);
  if (sum !== ctCount) {
    throw new Error(`rowGroups sum ${sum} ≠ expected ${ctCount}`);
  }

  // 3. Every candidate score ∈ [0, 1]
  for (const [ch, candidates] of Object.entries(result.candidatesByChar)) {
    for (const c of candidates) {
      if (c.score < 0 || c.score > 1) {
        throw new Error(`Score out of range for ${ch}→${c.token}: ${c.score}`);
      }
    }
  }
}
