import { describe, it, expect, beforeEach } from 'vitest';
import { separatorModeScore, fixedModeScore } from '../../src/utils/analyzer';
import { resetIds, otRow, ztList } from '../helpers';
import type { OTChar, ZTToken } from '../../src/types/domain';

beforeEach(() => resetIds());

// ---------------------------------------------------------------------------
// separatorModeScore
// ---------------------------------------------------------------------------
describe('separatorModeScore', () => {
  describe('perfect frequency match', () => {
    it('1:1 — single-occurrence char and token → score 1.0', () => {
      const otRows = [otRow('H', 'E', 'L', 'L', 'O')];
      const zt = ztList('11', '22', '33', '33', '44');

      const res = separatorModeScore({ token: '11', otChar: 'H', otRows, effectiveZtTokens: zt });

      expect(res.support).toBe(1);
      expect(res.occurrences).toBe(1);
      expect(res.score).toBe(1.0);
    });

    it('2:2 — repeated char and matching token frequency → score 1.0', () => {
      const otRows = [otRow('H', 'E', 'L', 'L', 'O')];
      const zt = ztList('11', '22', '33', '33', '44');

      const res = separatorModeScore({ token: '33', otChar: 'L', otRows, effectiveZtTokens: zt });

      expect(res.support).toBe(2);
      expect(res.occurrences).toBe(2);
      expect(res.score).toBe(1.0);
    });

    it('3:3 — all-duplicate tokens match all-same OT chars', () => {
      const otRows = [otRow('A', 'A', 'A')];
      const zt = ztList('11', '11', '11');

      const res = separatorModeScore({ token: '11', otChar: 'A', otRows, effectiveZtTokens: zt });

      expect(res.support).toBe(3);
      expect(res.occurrences).toBe(3);
      expect(res.score).toBe(1.0);
    });
  });

  describe('frequency mismatch', () => {
    it('token freq > OT freq → score = min/max', () => {
      const otRows = [otRow('H', 'E', 'L', 'L', 'O')];
      const zt = ztList('11', '22', '33', '33', '44');

      // H=1x, '33'=2x → score 1/2 = 0.5
      const res = separatorModeScore({ token: '33', otChar: 'H', otRows, effectiveZtTokens: zt });
      expect(res.score).toBe(0.5);
    });

    it('candidate ranking: best match first', () => {
      const otRows = [otRow('A', 'A', 'A')];
      const zt = ztList('11', '11', '11', '22', '22', '33');

      const s11 = separatorModeScore({ token: '11', otChar: 'A', otRows, effectiveZtTokens: zt });
      const s22 = separatorModeScore({ token: '22', otChar: 'A', otRows, effectiveZtTokens: zt });
      const s33 = separatorModeScore({ token: '33', otChar: 'A', otRows, effectiveZtTokens: zt });

      expect(s11.score).toBeGreaterThan(s22.score);
      expect(s22.score).toBeGreaterThan(s33.score);
    });

    it('token freq < OT freq → score = tokenFreq / otFreq', () => {
      const otRows = [otRow('A', 'A', 'A')];
      const zt = ztList('11');

      const res = separatorModeScore({ token: '11', otChar: 'A', otRows, effectiveZtTokens: zt });

      expect(res.support).toBe(1);
      expect(res.occurrences).toBe(3);
      expect(res.score).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('edge cases', () => {
    it('empty OT and ZT → all zeros', () => {
      const res = separatorModeScore({ token: '11', otChar: 'A', otRows: [[]], effectiveZtTokens: [] });

      expect(res.support).toBe(0);
      expect(res.occurrences).toBe(0);
      expect(res.score).toBe(0);
    });

    it('non-existent token → support 0, score 0', () => {
      const otRows = [otRow('A')];
      const zt = ztList('11', '22');

      const res = separatorModeScore({ token: '99', otChar: 'A', otRows, effectiveZtTokens: zt });
      expect(res.support).toBe(0);
      expect(res.score).toBe(0);
    });

    it('non-existent OT char → occurrences 0, score 0', () => {
      const otRows = [otRow('A')];
      const zt = ztList('11');

      const res = separatorModeScore({ token: '11', otChar: 'Z', otRows, effectiveZtTokens: zt });
      expect(res.occurrences).toBe(0);
      expect(res.score).toBe(0);
    });
  });

  describe('invariants', () => {
    it('score ∈ [0, 1] for all token×char combinations', () => {
      const otRows = [otRow('A', 'B', 'A', 'B', 'C')];
      const zt = ztList('11', '22', '11', '22', '33', '44', '55');

      for (const tok of ['11', '22', '33', '44', '55', '99']) {
        for (const ch of ['A', 'B', 'C', 'Z']) {
          const res = separatorModeScore({ token: tok, otChar: ch, otRows, effectiveZtTokens: zt });
          expect(res.score).toBeGreaterThanOrEqual(0);
          expect(res.score).toBeLessThanOrEqual(1);
        }
      }
    });

    it('support and occurrences are non-negative for any input', () => {
      const res = separatorModeScore({
        token: 'missing', otChar: 'missing', otRows: [otRow('X')], effectiveZtTokens: ztList('a'),
      });

      expect(res.support).toBeGreaterThanOrEqual(0);
      expect(res.occurrences).toBeGreaterThanOrEqual(0);
    });
  });
});

// ---------------------------------------------------------------------------
// fixedModeScore
// ---------------------------------------------------------------------------
type Col = { ot: { ch: string } | null; zt: number[] };

describe('fixedModeScore', () => {
  it('scores from current shifted grid, not raw re-chunking', () => {
    const effectiveZtTokens: ZTToken[] = [
      { id: 'c0', text: '1' }, { id: 'c1', text: '1' },
      { id: 'c2', text: '2' }, { id: 'c3', text: '2' },
    ];
    const columns: Col[][] = [[
      { ot: { ch: 'A' }, zt: [0, 1] },  // "11"
      { ot: { ch: 'A' }, zt: [] },       // empty A cell
    ]];

    const s11 = fixedModeScore({ token: '11', otChar: 'A', columns, effectiveZtTokens, groupSize: 2 });
    expect(s11.score).toBe(0.5);
    expect(s11.support).toBe(1);
    expect(s11.occurrences).toBe(2);

    const s22 = fixedModeScore({ token: '22', otChar: 'A', columns, effectiveZtTokens, groupSize: 2 });
    expect(s22.support).toBe(0);
    expect(s22.score).toBe(0);
  });

  it('non-existent group text yields score 0', () => {
    // Tokens: 1 1 2 9 9 1 1  (indices 0..6)
    const effectiveZtTokens: ZTToken[] = [
      { id: 'c0', text: '1' }, { id: 'c1', text: '1' },
      { id: 'c2', text: '2' },
      { id: 'c3', text: '9' }, { id: 'c4', text: '9' },
      { id: 'c5', text: '1' }, { id: 'c6', text: '1' },
    ];
    // Grid groups: A→"11", H→"2", deception→"99", X→"11"
    const columns: Col[][] = [[
      { ot: { ch: 'A' }, zt: [0, 1] },
      { ot: { ch: 'H' }, zt: [2] },
      { ot: null,         zt: [3, 4] },
      { ot: { ch: 'X' }, zt: [5, 6] },
    ]];

    // '29' and '91' do not appear as any group text in this grid
    expect(fixedModeScore({ token: '29', otChar: 'H', columns, effectiveZtTokens, groupSize: 2 }).score).toBe(0);
    expect(fixedModeScore({ token: '91', otChar: 'H', columns, effectiveZtTokens, groupSize: 2 }).score).toBe(0);
  });

  describe('invariants', () => {
    it('score ∈ [0, 1]', () => {
      const effectiveZtTokens: ZTToken[] = [
        { id: 'c0', text: '1' }, { id: 'c1', text: '1' },
        { id: 'c2', text: '2' }, { id: 'c3', text: '2' },
      ];
      const columns: Col[][] = [[
        { ot: { ch: 'A' }, zt: [0, 1] },
        { ot: { ch: 'B' }, zt: [2, 3] },
      ]];

      for (const tok of ['11', '22', '99', '12']) {
        for (const ch of ['A', 'B', 'Z']) {
          const res = fixedModeScore({ token: tok, otChar: ch, columns, effectiveZtTokens, groupSize: 2 });
          expect(res.score).toBeGreaterThanOrEqual(0);
          expect(res.score).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
