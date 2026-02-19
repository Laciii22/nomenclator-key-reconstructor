import { describe, it, expect } from 'vitest';
import { chooseScoreOneSimple } from '../chooseScoreOneSimple';

describe('chooseScoreOneSimple', () => {
  it('picks unique score==1 candidates and marks ambiguous ones', () => {
    const input = {
      a: [ { token: 'x', score: 1 } ],
      b: [ { token: 'y', score: 1 }, { token: 'z', score: 1 } ],
      c: [ { token: 'u', score: 0.5 } ]
    } as any;
    const res = chooseScoreOneSimple(input);
    expect(res.picks).toEqual({ a: 'x' });
    expect(res.ambiguous).toEqual(['b']);
  });
});
