import { describe, expect, it } from 'vitest';
import { canShiftLeft, canShiftRight, shiftLeft, shiftRight } from '../../src/mapping/manualShift';

describe('manualShift', () => {
  it('shiftRight moves one char to the right (A11 H2 -> A1 H12)', () => {
    const maxLen = 2;
    const counts = [2, 1];

    expect(canShiftRight(counts, 0)).toBe(true);
    expect(shiftRight(counts, 0, maxLen)).toEqual([1, 2]);
  });

  it('cannot shift away the last char (would empty a cell)', () => {
    const maxLen = 2;
    const counts = [1, 2];

    expect(canShiftRight(counts, 0)).toBe(false);
    expect(shiftRight(counts, 0, maxLen)).toBe(counts);

    expect(canShiftLeft(counts, 0)).toBe(false);
    expect(shiftLeft(counts, 0, maxLen)).toBe(counts);
  });

  it('cascades overflow when shifting into a full neighbor', () => {
    const maxLen = 2;
    const counts = [2, 2, 0];

    // Move one from cell0 -> cell1 makes cell1=3, so overflow 1 goes to cell2
    expect(shiftRight(counts, 0, maxLen)).toEqual([1, 2, 1]);
  });
});
