import { describe, expect, it } from 'vitest';
import { buildMultiKeyColumns } from '../../src/utils/multiKeyMapping';
import type { CTToken, PTChar } from '../../src/types/domain';

function makePtRow(chars: string): PTChar[][] {
  return [chars.split('').map((ch, idx) => ({ id: `pt-${idx}`, ch }))];
}

function makeCtTokens(values: string[]): CTToken[] {
  return values.map((text, idx) => ({ id: `ct-${idx}`, text }));
}

describe('buildMultiKeyColumns', () => {
  it('shifts inside local segment to confirmed homophone and leaves skipped token as deception', () => {
    const ptRows = makePtRow('AHAHO');
    const ctTokens = makeCtTokens(['11', '22', '11', '99', '33', '44', '99', '99']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      { A: ['11'] },
      { H: ['22', '33'] },
      1,
    );

    expect(columns).toHaveLength(1);

    expect(columns[0][0].pt?.ch).toBe('A');
    expect(columns[0][0].ct).toEqual([0]);

    expect(columns[0][1].pt?.ch).toBe('H');
    expect(columns[0][1].ct).toEqual([1]);

    expect(columns[0][2].pt?.ch).toBe('A');
    expect(columns[0][2].ct).toEqual([2]);

    expect(columns[0][3].pt).toBeNull();
    expect(columns[0][3].deception).toBe(true);
    expect(columns[0][3].ct).toEqual([3]);

    expect(columns[0][4].pt?.ch).toBe('H');
    expect(columns[0][4].ct).toEqual([4]);
    expect(columns[0][4].tentative).toBeUndefined();
  });

  it('keeps sequential allocation between locked anchors and marks mismatch as tentative', () => {
    const ptRows = makePtRow('AHAHO');
    const ctTokens = makeCtTokens(['11', '22', '11', '33', '44']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      { A: ['11'], O: ['44'] },
      { H: ['33'] },
      1,
    );

    expect(columns).toHaveLength(1);
    expect(columns[0]).toHaveLength(5);

    expect(columns[0][0].pt?.ch).toBe('A');
    expect(columns[0][0].ct).toEqual([0]);
    expect(columns[0][0].tentative).toBeUndefined();

    expect(columns[0][1].pt?.ch).toBe('H');
    expect(columns[0][1].ct).toEqual([1]);
    expect(columns[0][1].tentative).toBe(true);

    expect(columns[0][2].pt?.ch).toBe('A');
    expect(columns[0][2].ct).toEqual([2]);
    expect(columns[0][2].tentative).toBeUndefined();

    expect(columns[0][3].pt?.ch).toBe('H');
    expect(columns[0][3].ct).toEqual([3]);
    expect(columns[0][3].tentative).toBeUndefined();

    expect(columns[0][4].pt?.ch).toBe('O');
    expect(columns[0][4].ct).toEqual([4]);
    expect(columns[0][4].tentative).toBeUndefined();

    expect(columns[0].some(c => c.deception)).toBe(false);
  });

  it('does not consume a CT group that is hard-locked for another PT char', () => {
    const ptRows = makePtRow('HA');
    const ctTokens = makeCtTokens(['11', '22']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      { A: ['11'] },
      { H: ['22'] },
      1,
    );

    expect(columns).toHaveLength(1);
    expect(columns[0][0].pt?.ch).toBe('H');
    expect(columns[0][0].ct).toEqual([]);

    expect(columns[0][1].pt?.ch).toBe('A');
    expect(columns[0][1].ct).toEqual([0]);

    expect(columns[0][2].pt).toBeNull();
    expect(columns[0][2].deception).toBe(true);
    expect(columns[0][2].ct).toEqual([1]);
  });
});
