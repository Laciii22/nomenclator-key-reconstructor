import { describe, expect, it } from 'vitest';
import type { OTChar, ZTToken } from '../../src/types/domain';
import { fixedModeScore, separatorModeScore } from '../../src/utils/analyzer';

describe('scoring strategies', () => {
  it('separatorModeScore scores by token frequency vs OT cell count', () => {
    const otRows: OTChar[][] = [[{ id: 'a1', ch: 'A' }, { id: 'a2', ch: 'A' }]];
    const effectiveZtTokens: ZTToken[] = [
      { id: 't0', text: '11' },
      { id: 't1', text: '11' },
      { id: 't2', text: '22' },
    ];

    const s11 = separatorModeScore({ token: '11', otChar: 'A', otRows, effectiveZtTokens });
    expect(s11.support).toBe(2);
    expect(s11.occurrences).toBe(2);
    expect(s11.score).toBe(1);

    const s22 = separatorModeScore({ token: '22', otChar: 'A', otRows, effectiveZtTokens });
    expect(s22.support).toBe(1);
    expect(s22.occurrences).toBe(2);
    expect(s22.score).toBe(0.5);
  });

  it('fixedModeScore derives support from the current mapping (columns)', () => {
    const effectiveZtTokens: ZTToken[] = [
      { id: 'c0', text: '1' },
      { id: 'c1', text: '1' },
      { id: 'c2', text: '2' },
      { id: 'c3', text: '2' },
    ];

    const columns = [
      [
        { ot: { ch: 'A' }, zt: [0, 1] }, // "11"
        { ot: { ch: 'A' }, zt: [] },     // empty but still an A cell
      ],
    ];

    const s11 = fixedModeScore({ token: '11', otChar: 'A', columns, effectiveZtTokens, groupSize: 2 });
    // token is present under A somewhere => high confidence
    expect(s11.score).toBe(1);
    expect(s11.support).toBe(1);
    expect(s11.occurrences).toBe(2);

    const s22 = fixedModeScore({ token: '22', otChar: 'A', columns, effectiveZtTokens, groupSize: 2 });
    expect(s22.support).toBe(0);
    expect(s22.occurrences).toBe(2);
    expect(s22.score).toBe(0);
  });
});
