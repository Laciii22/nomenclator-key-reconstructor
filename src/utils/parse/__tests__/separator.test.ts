import { describe, it, expect } from 'vitest';
import { parseSeparatorRaw } from '../separator';

describe('parseSeparatorRaw', () => {
  it('returns none for empty input', () => {
    const res = parseSeparatorRaw('', ':', 5);
    expect(res.tokens).toHaveLength(0);
    expect(res.klamacStatus).toBe('none');
  });

  it('detects ok when token count equals otCount', () => {
    const res = parseSeparatorRaw('a:b:c', ':', 3);
    expect(res.tokens.map(t => t.text)).toEqual(['a','b','c']);
    expect(res.klamacStatus).toBe('ok');
  });

  it('detects needsKlamac when more tokens than OT', () => {
    const res = parseSeparatorRaw('a:b:c:d', ':', 3);
    expect(res.klamacStatus).toBe('needsKlamac');
  });

  it('detects invalid when fewer tokens than OT', () => {
    const res = parseSeparatorRaw('a:b', ':', 3);
    expect(res.klamacStatus).toBe('invalid');
  });
});
