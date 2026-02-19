import { describe, it, expect, beforeEach } from 'vitest';
import { analyze } from '../../src/utils/analyzer';
import { resetIds, otRow, ztList, OPTS_SINGLE, assertAnalysisInvariants } from '../helpers';
import type { OTChar, ZTToken } from '../../src/types/domain';

beforeEach(() => resetIds());

describe('analyze() — invariants & conflict detection', () => {
  // -----------------------------------------------------------------
  // rowGroups sum invariant
  // -----------------------------------------------------------------
  describe('rowGroups sum invariant', () => {
    it('holds with no locks', () => {
      const otRows: OTChar[][] = [otRow('A', 'H', 'A', 'H', 'O')];
      const ztTokens = ztList('11', '22', '11', '22', '99', '33', '99');
      const rowGroups = [[2, 2, 1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
      assertAnalysisInvariants(result, ztTokens.length);
    });

    it('holds after locking one character', () => {
      const otRows: OTChar[][] = [otRow('A', 'H', 'A', 'H', 'O')];
      const ztTokens = ztList('11', '22', '11', '22', '99', '33', '99');
      const rowGroups = [[2, 2, 1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: '11' });
      assertAnalysisInvariants(result, ztTokens.length);
    });

    it('holds after locking all characters', () => {
      const otRows: OTChar[][] = [otRow('A', 'H', 'A', 'H', 'O')];
      const ztTokens = ztList('11', '22', '11', '22', '99', '33', '99');
      const rowGroups = [[2, 2, 1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: '11', H: '22', O: '33' });
      assertAnalysisInvariants(result, ztTokens.length);
    });
  });

  // -----------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------
  describe('edge cases', () => {
    it('single OT char + single ZT token (1:1)', () => {
      const otRows: OTChar[][] = [otRow('X')];
      const ztTokens = ztList('42');
      const rowGroups = [[1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
      assertAnalysisInvariants(result, 1);

      const candX = result.candidatesByChar['X'];
      expect(candX).toBeDefined();
      expect(candX[0].score).toBe(1.0);
    });

    it('OT count > ZT count (degenerate)', () => {
      const otRows: OTChar[][] = [otRow('A', 'B', 'C')];
      const ztTokens = ztList('11');
      const rowGroups = [[1, 0, 0]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
      assertAnalysisInvariants(result, 1);
    });

    it('all-duplicate ZT tokens', () => {
      const otRows: OTChar[][] = [otRow('A', 'B')];
      const ztTokens = ztList('11', '11');
      const rowGroups = [[1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
      assertAnalysisInvariants(result, 2);

      // A:1x, '11':2x → score = 1/2
      const candA = result.candidatesByChar['A']?.find(c => c.token === '11');
      expect(candA).toBeDefined();
      expect(candA!.score).toBe(0.5);
    });

    it('candidates list covers every unique ZT token', () => {
      const otRows: OTChar[][] = [otRow('A', 'B')];
      const ztTokens = ztList('11', '22', '33');
      const rowGroups = [[2, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

      const tokensForA = (result.candidatesByChar['A'] ?? []).map(c => c.token).sort();
      expect(tokensForA).toEqual(['11', '22', '33']);
    });

    it('OT with repeated-only character', () => {
      const otRows: OTChar[][] = [otRow('A', 'A', 'A')];
      const ztTokens = ztList('11', '11', '11');
      const rowGroups = [[1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);
      assertAnalysisInvariants(result, 3);

      const best = result.candidatesByChar['A']?.[0];
      expect(best).toBeDefined();
      expect(best!.score).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------
  // Regression guards
  // -----------------------------------------------------------------
  describe('regression guards', () => {
    it('token "11" is a top-scoring candidate for A in AHAHO scenario', () => {
      const otRows: OTChar[][] = [otRow('A', 'H', 'A', 'H', 'O')];
      const ztTokens = ztList('11', '22', '11', '22', '99', '33', '99');
      const rowGroups = [[2, 2, 1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

      const candA = result.candidatesByChar['A'] ?? [];
      const for11 = candA.find(c => c.token === '11');
      expect(for11).toBeDefined();
      expect(for11!.score).toBe(1.0);
      // With deception tokens (99 freq=2, 22 freq=2), ties are expected
      const topScore = Math.max(...candA.map(c => c.score));
      expect(for11!.score).toBe(topScore);
    });

    it('best candidate for O is token "33" (unique 1:1)', () => {
      const otRows: OTChar[][] = [otRow('A', 'H', 'A', 'H', 'O')];
      const ztTokens = ztList('11', '22', '11', '22', '99', '33', '99');
      const rowGroups = [[2, 2, 1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

      const candO = result.candidatesByChar['O'] ?? [];
      const for33 = candO.find(c => c.token === '33');
      expect(for33).toBeDefined();
      expect(for33!.score).toBe(1.0);
    });

    it('changing scoring formula must affect candidate ordering', () => {
      // A:2x, B:1x; tokens: 11(2x), 22(1x) — A → best is '11'
      const otRows: OTChar[][] = [otRow('A', 'B', 'A')];
      const ztTokens = ztList('11', '22', '11');
      const rowGroups = [[1, 1, 1]];

      const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

      const candA = result.candidatesByChar['A'] ?? [];
      const best = candA.reduce((a, b) => (a.score > b.score ? a : b));
      expect(best.token).toBe('11');
      expect(best.score).toBe(1.0);

      // '22' for A: freq 1 vs occ 2 → score 0.5
      const for22 = candA.find(c => c.token === '22');
      expect(for22).toBeDefined();
      expect(for22!.score).toBe(0.5);
    });
  });
});
