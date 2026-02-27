import { describe, it, expect } from 'vitest';
import { canShiftLeft, canShiftRight, shiftLeft, shiftRight } from '../../src/mapping/manualShift';

describe('manualShift', () => {
  const MAX_LEN = 2;

  describe('shiftRight', () => {
    it('moves one token to the right neighbor', () => {
      const counts = [2, 1];

      expect(canShiftRight(counts, 0, MAX_LEN)).toBe(true);
      expect(shiftRight(counts, 0, MAX_LEN)).toEqual([1, 2]);
    });

    it('cascades overflow when neighbor is already full', () => {
      const counts = [2, 2, 0];

      expect(shiftRight(counts, 0, MAX_LEN)).toEqual([1, 2, 1]);
    });
  });

  describe('shiftLeft', () => {
    it('cannot shift when source cell has only 1 token', () => {
      const counts = [1, 2];

      expect(canShiftLeft(counts, 0, MAX_LEN)).toBe(false);
      expect(shiftLeft(counts, 0, MAX_LEN)).toBe(counts);
    });
  });

  describe('boundary guards', () => {
    it('cannot shift away the last token (would empty cell)', () => {
      const counts = [1, 2];

      expect(canShiftRight(counts, 0, MAX_LEN)).toBe(false);
      expect(shiftRight(counts, 0, MAX_LEN)).toBe(counts);
    });
  });
});
