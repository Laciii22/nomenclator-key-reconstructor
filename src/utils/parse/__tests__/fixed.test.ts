import { describe, it, expect } from 'vitest';
import { parseFixedRaw } from '../fixed';

describe('parseFixedRaw', () => {
  it('returns none for empty input', () => {
    const res = parseFixedRaw('', 2, 4);
    expect(res.tokens).toHaveLength(0);
    expect(res.klamacStatus).toBe('none');
  });

  it('detects invalid when leftover characters exist', () => {
    const res = parseFixedRaw('abcdx', 2, 2);
    expect(res.klamacStatus).toBe('invalid');
    expect(res.statusMessage).toContain('Incomplete group');
  });

  it('detects needsKlamac when groups exceed OT', () => {
    const res = parseFixedRaw('abcdef', 1, 3); // 6 groups, OT 3
    expect(res.klamacStatus).toBe('needsKlamac');
  });

  it('detects ok when groups match OT', () => {
    const res = parseFixedRaw('abcd', 2, 2);
    expect(res.klamacStatus).toBe('ok');
  });
});
