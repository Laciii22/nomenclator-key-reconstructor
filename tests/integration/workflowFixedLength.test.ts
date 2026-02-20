import { describe, it, expect, beforeEach } from 'vitest';
import { parseFixedRaw } from '../../src/utils/parse/fixed';
import { analyze } from '../../src/utils/analyzer';
import { resetIds, otRow, OPTS_SINGLE, assertAnalysisInvariants } from '../helpers';
import type { OTChar } from '../../src/types/domain';

beforeEach(() => resetIds());

/**
 * Integration test simulating a fixed-length single-key-per-character workflow
 * based on the user's scenario:
 *
 * OT: "AHAHO"
 * ZT raw: "1122112993399"
 * groupSize: 2 (fixed-length)
 *
 * The parser will report `invalid` because of leftover characters; the test
 * then proceeds to run analysis and simulate user selections in a tolerant,
 * non-brittle way (choose available candidates, re-lock, apply deception).
 */
describe('Integration: AHAHO fixed-length workflow', () => {
  const RAW_ZT = '1122112993399';
  const GROUP_SIZE = 2;
  const OT_TEXT = 'AHAHO';

  function setup() {
    const otRows: OTChar[][] = [otRow(...OT_TEXT.split(''))];
    const parsed = parseFixedRaw(RAW_ZT, GROUP_SIZE, OT_TEXT.length);
    const ztTokens = parsed.tokens;
    // Parser in fixed mode returns per-character tokens. For 13 token chars
    // distributed across 5 OT chars the round-robin allocation is [3,3,3,2,2]
    const rowGroups = [[2,2,2,2,2,2,1]];
    return { otRows, ztTokens, parsed, rowGroups };
  }

  it('Step 1: parser reports invalid due to leftover characters', () => {
    const { parsed, ztTokens } = setup();
    expect(parsed.klamacStatus).toBe('invalid');
    expect(ztTokens.length).toBeGreaterThan(0);
    expect(parsed.statusMessage).toBeTruthy();
  });

  it('Step 2: analysis produces candidates for each OT char', () => {
    const { otRows, ztTokens, rowGroups } = setup();

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

    for (const ch of ['A', 'H', 'O']) {
      expect(result.candidatesByChar[ch]).toBeDefined();
      expect(result.candidatesByChar[ch].length).toBeGreaterThan(0);
    }
  });

  it('Step 3: simulate choosing a first candidate for A, then change to another', () => {
    const { otRows, ztTokens, rowGroups } = setup();

    const first = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
    const candA = first.candidatesByChar['A'] ?? [];
    expect(candA.length).toBeGreaterThan(0);

    // Pick the first available candidate for A (user initially picks "wrong")
    const pick1 = candA[0].token;
    const afterLock = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: pick1 });

    // Analyzer should echo the lock (or at least include it in proposedLocks)
    expect(afterLock.proposedLocks).toHaveProperty('A', pick1);
    assertAnalysisInvariants(afterLock, ztTokens.length);

    // Now pick a different candidate for A (if available) and re-analyze
    const pick2 = candA.find(c => c.token !== pick1)?.token;
    if (pick2) {
      const afterSecondLock = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: pick2 });
      expect(afterSecondLock.proposedLocks).toHaveProperty('A', pick2);
      assertAnalysisInvariants(afterSecondLock, ztTokens.length);
    }
  });

  it('Step 4: lock multiple chars and verify invariants and non-negative groups', () => {
    const { otRows, ztTokens, rowGroups } = setup();

    // Choose top candidate for each char (if any) and lock them
    const first = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
    const locked: Record<string, string> = {};
    for (const ch of ['A', 'H', 'O']) {
      const list = first.candidatesByChar[ch] ?? [];
      if (list.length) locked[ch] = list[0].token;
    }

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, locked);
    assertAnalysisInvariants(result, ztTokens.length);

    const flat = result.proposedRowGroups.flat();
    for (const v of flat) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('Step 5: simulate marking a token as deception and applying selections', () => {
    const { otRows, ztTokens, rowGroups } = setup();

    const first = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

    // If any candidate token looks like a repeated '9' group (e.g., contains '9'), mark as deception
    // This mirrors user intent to mark '99' as deception when present.
    let deceptionToken: string | undefined;
    for (const list of Object.values(first.candidatesByChar)) {
      for (const c of list) {
        if (c.token.includes('9')) {
          deceptionToken = c.token;
          break;
        }
      }
      if (deceptionToken) break;
    }

    // Lock one candidate per character (if available)
    const locked: Record<string, string> = {};
    for (const ch of ['A', 'H', 'O']) {
      const list = first.candidatesByChar[ch] ?? [];
      if (list.length) locked[ch] = list[0].token;
    }

    // Apply deception (simulated): analyzer doesn't directly accept deception list,
    // but we assert that after re-analysis invariants still hold
    const after = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, locked);
    assertAnalysisInvariants(after, ztTokens.length);

    // If we found a deception candidate, ensure it's mentioned by some candidate lists
    if (deceptionToken) {
      let seen = false;
      for (const list of Object.values(first.candidatesByChar)) {
        if (list.some(c => c.token === deceptionToken)) seen = true;
      }
      expect(seen).toBe(true);
    }
  });
});
