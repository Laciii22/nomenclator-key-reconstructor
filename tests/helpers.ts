/**
 * Shared test factories for OTChar / ZTToken creation.
 *
 * Usage:
 *   beforeEach(() => resetIds());
 *   const rows = [otRow('A', 'H', 'A')];
 *   const tokens = ztList('11', '22', '11');
 */

import type { OTChar, ZTToken } from '../src/types/domain';
import type { AnalysisOptions, AnalysisResult } from '../src/utils/analyzer';

// ---------------------------------------------------------------------------
// Id counters (reset between tests to keep ids deterministic)
// ---------------------------------------------------------------------------
let _otId = 0;
let _ztId = 0;

export function resetIds(): void {
  _otId = 0;
  _ztId = 0;
}

// ---------------------------------------------------------------------------
// OT factories
// ---------------------------------------------------------------------------

/** Single OTChar with auto-incremented id. */
export function ot(ch: string): OTChar {
  return { id: `ot_${_otId++}`, ch };
}

/** One row of OTChars from a list of characters. */
export function otRow(...chars: string[]): OTChar[] {
  return chars.map(ch => ot(ch));
}

/** OTChar[][] (single row) from a plain string – one char per cell. */
export function otFromString(s: string): OTChar[][] {
  return [otRow(...s.split(''))];
}

// ---------------------------------------------------------------------------
// ZT factories
// ---------------------------------------------------------------------------

/** Single ZTToken with auto-incremented id. */
export function zt(text: string): ZTToken {
  return { id: `zt_${_ztId++}`, text };
}

/** Array of ZTTokens from a list of text values. */
export function ztList(...texts: string[]): ZTToken[] {
  return texts.map(t => zt(t));
}

/** Parse a separator-delimited string into ZTTokens. */
export function ztFromRaw(raw: string, sep = ':'): ZTToken[] {
  return raw.split(sep).filter(Boolean).map(t => zt(t));
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

export const OPTS_SINGLE: AnalysisOptions = { keysPerOTMode: 'single', groupSize: 1 };
export const OPTS_MULTI: AnalysisOptions = { keysPerOTMode: 'multiple', groupSize: 1 };

// ---------------------------------------------------------------------------
// Invariant assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert the fundamental invariants every AnalysisResult must satisfy.
 * Use inside any test that calls `analyze()`.
 */
export function assertAnalysisInvariants(
  result: AnalysisResult,
  ztCount: number,
): void {
  const flat = result.proposedRowGroups.flat();

  // 1. No negative cell counts
  for (const v of flat) {
    if (v < 0) throw new Error(`Negative cell count: ${v}`);
  }

  // 2. Sum of cell counts === total ZT tokens
  const sum = flat.reduce((s, v) => s + v, 0);
  if (sum !== ztCount) {
    throw new Error(`rowGroups sum ${sum} ≠ expected ${ztCount}`);
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
