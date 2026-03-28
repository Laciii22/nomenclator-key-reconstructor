import { describe, it, expect, beforeEach } from 'vitest';
import { parseSeparatorRaw } from '../../src/utils/parse/separator';
import { resetIds } from '../helpers';

beforeEach(() => resetIds());

describe('parseSeparatorRaw', () => {
  // -----------------------------------------------------------------
  // Empty / whitespace
  // -----------------------------------------------------------------
  describe('empty input', () => {
    it('returns empty tokens and status "none" for empty string', () => {
      const res = parseSeparatorRaw('', ':', 5);
      expect(res.tokens).toHaveLength(0);
      expect(res.klamacStatus).toBe('none');
      expect(res.statusMessage).toBeNull();
    });

    it('returns empty tokens for whitespace-only input', () => {
      const res = parseSeparatorRaw('   ', ':', 5);
      expect(res.tokens).toHaveLength(0);
      expect(res.klamacStatus).toBe('none');
    });
  });

  // -----------------------------------------------------------------
  // Status: ok
  // -----------------------------------------------------------------
  describe('status "ok" — token count === ptCount', () => {
    it('parses tokens correctly and reports ok', () => {
      const res = parseSeparatorRaw('1:2:3', ':', 3);

      expect(res.tokens).toHaveLength(3);
      expect(res.tokens.map(t => t.text)).toEqual(['1', '2', '3']);
      expect(res.klamacStatus).toBe('ok');
      expect(res.statusMessage).toBeNull();
    });

    it('works with single token matching single PT char', () => {
      const res = parseSeparatorRaw('42', ':', 1);

      expect(res.tokens).toHaveLength(1);
      expect(res.tokens[0].text).toBe('42');
      expect(res.klamacStatus).toBe('ok');
    });
  });

  // -----------------------------------------------------------------
  // Status: needsNull
  // -----------------------------------------------------------------
  describe('status "needsNull" — token count > ptCount', () => {
    it('sets needsNull and reports counts in message', () => {
      const res = parseSeparatorRaw('11:22:11:22:99:33:99', ':', 5);

      expect(res.klamacStatus).toBe('needsNull');
      expect(res.tokens).toHaveLength(7);

      // Avoid brittle exact-string check; verify the key numbers instead
      expect(res.statusMessage).toContain('5');  // PT count
      expect(res.statusMessage).toContain('7');  // CT count
    });

    it('even one extra token triggers needsNull', () => {
      const res = parseSeparatorRaw('1:2:3:4', ':', 3);
      expect(res.klamacStatus).toBe('needsNull');
    });
  });

  // -----------------------------------------------------------------
  // Status: invalid
  // -----------------------------------------------------------------
  describe('status "invalid" — token count < ptCount', () => {
    it('sets invalid when fewer tokens than PT chars', () => {
      const res = parseSeparatorRaw('1:2', ':', 5);

      expect(res.klamacStatus).toBe('invalid');
      expect(res.statusMessage).toContain('5');
      expect(res.statusMessage).toContain('2');
    });
  });

  // -----------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------
  describe('edge cases', () => {
    it('ptCount = 0 yields status "none"', () => {
      const res = parseSeparatorRaw('1:2:3', ':', 0);
      expect(res.klamacStatus).toBe('none');
    });

    it('different separator works correctly', () => {
      const res = parseSeparatorRaw('1;2;3', ';', 3);
      expect(res.tokens).toHaveLength(3);
      expect(res.klamacStatus).toBe('ok');
    });

    it('duplicate tokens are all preserved', () => {
      const res = parseSeparatorRaw('11:11:11', ':', 3);

      expect(res.tokens).toHaveLength(3);
      expect(res.tokens.every(t => t.text === '11')).toBe(true);
      expect(res.klamacStatus).toBe('ok');
    });

    it('each token gets a unique id', () => {
      const res = parseSeparatorRaw('1:1:1', ':', 3);
      const ids = res.tokens.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('separator absent from text yields 1 token', () => {
      const res = parseSeparatorRaw('123456', ':', 3);

      expect(res.tokens).toHaveLength(1);
      expect(res.tokens[0].text).toBe('123456');
      expect(res.klamacStatus).toBe('invalid');
    });
  });
});
