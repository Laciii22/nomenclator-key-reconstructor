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

    it('cannot shift when right-edge cascade has nowhere to go', () => {
      const counts = [2, 2];

      expect(canShiftRight(counts, 0, MAX_LEN)).toBe(false);
      expect(shiftRight(counts, 0, MAX_LEN)).toBe(counts);
    });

    it('does not mutate input array when shifting right', () => {
      const counts = [2, 1, 0];
      const snapshot = [...counts];

      void shiftRight(counts, 0, MAX_LEN);

      expect(counts).toEqual(snapshot);
    });
  });

  describe('shiftLeft', () => {
    it('cannot shift when source cell has only 1 token', () => {
      const counts = [1, 2];

      expect(canShiftLeft(counts, 0, MAX_LEN)).toBe(false);
      expect(shiftLeft(counts, 0, MAX_LEN)).toBe(counts);
    });

    it('moves one token to the left neighbor', () => {
      const counts = [1, 2];

      expect(canShiftLeft(counts, 1, MAX_LEN)).toBe(true);
      expect(shiftLeft(counts, 1, MAX_LEN)).toEqual([2, 1]);
    });

    it('cascades overflow to the left', () => {
      const counts = [0, 2, 2];

      expect(canShiftLeft(counts, 2, MAX_LEN)).toBe(true);
      expect(shiftLeft(counts, 2, MAX_LEN)).toEqual([1, 2, 1]);
    });

    it('cannot shift when left-edge cascade has nowhere to go', () => {
      const counts = [2, 2];

      expect(canShiftLeft(counts, 1, MAX_LEN)).toBe(false);
      expect(shiftLeft(counts, 1, MAX_LEN)).toBe(counts);
    });

    it('does not mutate input array when shifting left', () => {
      const counts = [0, 1, 2];
      const snapshot = [...counts];

      void shiftLeft(counts, 2, MAX_LEN);

      expect(counts).toEqual(snapshot);
    });
  });

  describe('boundary guards', () => {
    it('cannot shift away the last token (would empty cell)', () => {
      const counts = [1, 2];

      expect(canShiftRight(counts, 0, MAX_LEN)).toBe(false);
      expect(shiftRight(counts, 0, MAX_LEN)).toBe(counts);
    });

    it('rejects out-of-range indices', () => {
      const counts = [2, 1, 0];

      expect(canShiftLeft(counts, -1, MAX_LEN)).toBe(false);
      expect(canShiftRight(counts, 3, MAX_LEN)).toBe(false);
      expect(shiftLeft(counts, -1, MAX_LEN)).toBe(counts);
      expect(shiftRight(counts, 3, MAX_LEN)).toBe(counts);
    });
  });
});
