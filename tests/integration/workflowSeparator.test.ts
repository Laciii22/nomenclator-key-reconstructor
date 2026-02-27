import { describe, it, expect, beforeEach } from 'vitest';
import { parseSeparatorRaw } from '../../src/utils/parse/separator';
import { analyze } from '../../src/utils/analyzer';
import { resetIds, ptRow, OPTS_SINGLE, assertAnalysisInvariants } from '../helpers';
import type { PTChar } from '../../src/types/domain';

beforeEach(() => resetIds());

/**
 * Integration test simulating the full separator-mode workflow:
 *
 *  1. Input PT "AHAHO", CT "11:22:11:22:99:33:99", separator ":"
 *  2. Parse → detect deception tokens needed (7 CT > 5 PT)
 *  3. Run analysis → verify candidates exist for every PT char
 *  4. Select A → 22 first (wrong), verify it still has a candidate
 *  5. Select A → 11 (correct), lock it, re-analyze
 *  6. Select O → best score, lock it
 *  7. Mark 99 as deception, apply → verify invariants hold
 */
describe('Integration: AHAHO separator workflow', () => {
  const RAW_ZT = '11:22:11:22:99:33:99';
  const SEPARATOR = ':';
  const OT_TEXT = 'AHAHO';

  function setup() {
    const ptRows: PTChar[][] = [ptRow(...OT_TEXT.split(''))];
    const parsed = parseSeparatorRaw(RAW_ZT, SEPARATOR, OT_TEXT.length);
    const ctTokens = parsed.tokens;
    const rowGroups = [[2, 2, 1, 1, 1]]; // sums to 7
    return { ptRows, ctTokens, parsed, rowGroups };
  }

  it('Step 1: parse detects deception tokens needed (needsKlamac)', () => {
    const { parsed } = setup();

    expect(parsed.klamacStatus).toBe('needsKlamac');
    expect(parsed.tokens).toHaveLength(7);
    // Status message mentions both counts (not brittle on exact wording)
    expect(parsed.statusMessage).toContain('5');
    expect(parsed.statusMessage).toContain('7');
  });

  it('Step 2: analysis produces candidates for every PT character', () => {
    const { ptRows, ctTokens, rowGroups } = setup();

    const result = analyze(ptRows, ctTokens, rowGroups, OPTS_SINGLE);

    for (const ch of ['A', 'H', 'O']) {
      expect(result.candidatesByChar[ch], `candidates for '${ch}'`).toBeDefined();
      expect(result.candidatesByChar[ch].length).toBeGreaterThan(0);
    }
  });

  it('Step 3: token "11" is a top-scoring candidate for A (freq 2:2 → score 1.0)', () => {
    const { ptRows, ctTokens, rowGroups } = setup();

    const result = analyze(ptRows, ctTokens, rowGroups, OPTS_SINGLE);
    const candA = result.candidatesByChar['A'];
    const for11 = candA.find(c => c.token === '11');

    expect(for11).toBeDefined();
    expect(for11!.score).toBe(1.0);
    // With deception tokens, other tokens (22, 99) may also score 1.0 — that's expected
    const topScore = Math.max(...candA.map(c => c.score));
    expect(for11!.score).toBe(topScore);
  });

  it('Step 4: lock A→11, verify lock echoed and invariants hold', () => {
    const { ptRows, ctTokens, rowGroups } = setup();

    const result = analyze(ptRows, ctTokens, rowGroups, OPTS_SINGLE, { A: '11' });

    expect(result.proposedLocks).toHaveProperty('A', '11');
    assertAnalysisInvariants(result, ctTokens.length);
  });

  it('Step 5: lock A→11 + O→highest-score, both locks persist', () => {
    const { ptRows, ctTokens, rowGroups } = setup();

    // First pass: find best for O
    const firstPass = analyze(ptRows, ctTokens, rowGroups, OPTS_SINGLE, { A: '11' });
    const candO = firstPass.candidatesByChar['O'] ?? [];
    const bestO = candO.reduce((a, b) => (a.score > b.score ? a : b));

    // Second pass: lock both
    const locked = { A: '11', O: bestO.token };
    const result = analyze(ptRows, ctTokens, rowGroups, OPTS_SINGLE, locked);

    expect(result.proposedLocks).toHaveProperty('A', '11');
    expect(result.proposedLocks).toHaveProperty('O', bestO.token);
    assertAnalysisInvariants(result, ctTokens.length);
  });

  it('Step 6: full lock (A:11, H:22, O:33) — no conflicts, invariants hold', () => {
    const { ptRows, ctTokens, rowGroups } = setup();
    const locked = { A: '11', H: '22', O: '33' };

    const result = analyze(ptRows, ctTokens, rowGroups, OPTS_SINGLE, locked);

    assertAnalysisInvariants(result, ctTokens.length);

    // All proposed row group values must be non-negative
    const flat = result.proposedRowGroups.flat();
    for (const v of flat) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
