import { describe, it, expect } from 'vitest';
import { fixedModeScore } from '../analyzer';
import type { ZTToken } from '../../types/domain';

// Minimal ColumnLike shape expected by fixedModeScore
type Col = { ot: { ch: string } | null; zt: number[] };

describe('fixedModeScore (shift-aware)', () => {
  it('scores based on current shifted grid groups (e.g. 99 exists, 29/91 do not)', () => {
    // Underlying ZT stream as individual characters/digits.
    // Indices: 0..6
    // text:    1 1 2 9 9 1 1
    const effectiveZtTokens: ZTToken[] = [
      { text: '1', raw: '1' },
      { text: '1', raw: '1' },
      { text: '2', raw: '2' },
      { text: '9', raw: '9' },
      { text: '9', raw: '9' },
      { text: '1', raw: '1' },
      { text: '1', raw: '1' },
    ];

    // Grid after manual shifting created these cell groups:
    // A -> 11  (indices 0,1)
    // H -> 2   (index 2)          (invalid length but should be considered)
    // deception -> 99 (indices 3,4)
    // (next) -> 11 (indices 5,6)
    const columns: Col[][] = [
      [
        { ot: { ch: 'A' }, zt: [0, 1] },
        { ot: { ch: 'H' }, zt: [2] },
        { ot: null, zt: [3, 4] },
        { ot: { ch: 'X' }, zt: [5, 6] },
      ],
    ];

    // H appears once in OT grid.
    const res99 = fixedModeScore({ token: '99', otChar: 'H', columns, effectiveZtTokens, groupSize: 2 });
    const res29 = fixedModeScore({ token: '29', otChar: 'H', columns, effectiveZtTokens, groupSize: 2 });
    const res91 = fixedModeScore({ token: '91', otChar: 'H', columns, effectiveZtTokens, groupSize: 2 });

    expect(res99.support).toBe(1);
    expect(res99.occurrences).toBe(1);
    expect(res99.score).toBe(1);

    expect(res29.support).toBe(0);
    expect(res29.score).toBe(0);

    expect(res91.support).toBe(0);
    expect(res91.score).toBe(0);
  });

  it('does not require deception to compute a frequency score', () => {
    const effectiveZtTokens: ZTToken[] = [
      { text: '1', raw: '1' },
      { text: '1', raw: '1' },
      { text: '2', raw: '2' },
      { text: '2', raw: '2' },
    ];

    // No deception cells; OT has exactly 2 cells.
    const columns: Col[][] = [
      [
        { ot: { ch: 'A' }, zt: [0, 1] }, // 11
        { ot: { ch: 'H' }, zt: [2, 3] }, // 22
      ],
    ];

    // Token '11' appears once; A occurs once => score 1.
    const res = fixedModeScore({ token: '11', otChar: 'A', columns, effectiveZtTokens, groupSize: 2 });
    expect(res.support).toBe(1);
    expect(res.occurrences).toBe(1);
    expect(res.score).toBe(1);
  });
});
