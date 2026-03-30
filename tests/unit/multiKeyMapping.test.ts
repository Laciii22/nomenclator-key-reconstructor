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

    // Without lookahead, H consumes sequentially (99 is not 22 or 33, so tentative).
    expect(columns[0][3].pt?.ch).toBe('H');
    expect(columns[0][3].ct).toEqual([3]);
    expect(columns[0][3].tentative).toBe(true);

    // O consumes sequentially (no lock, so no tentative).
    expect(columns[0][4].pt?.ch).toBe('O');
    expect(columns[0][4].ct).toEqual([4]);
    expect(columns[0][4].tentative).toBeUndefined();

    // Rest become deception
    expect(columns[0][5].pt).toBeNull();
    expect(columns[0][5].deception).toBe(true);
    expect(columns[0][5].ct).toEqual([5]);

    expect(columns[0][6].pt).toBeNull();
    expect(columns[0][6].deception).toBe(true);
    expect(columns[0][6].ct).toEqual([6]);

    expect(columns[0][7].pt).toBeNull();
    expect(columns[0][7].deception).toBe(true);
    expect(columns[0][7].ct).toEqual([7]);
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

  it('keeps confirmed locks higher priority than selections for the same PT char', () => {
    const ptRows = makePtRow('A');
    const ctTokens = makeCtTokens(['11']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      { A: ['11'] },
      { A: ['22'] },
      1,
    );

    expect(columns).toHaveLength(1);
    expect(columns[0]).toHaveLength(1);
    expect(columns[0][0].pt?.ch).toBe('A');
    expect(columns[0][0].ct).toEqual([0]);
    expect(columns[0][0].tentative).toBeUndefined();
  });

  it('stops lookahead at foreign hard-lock boundary and keeps current cell tentative', () => {
    const ptRows = makePtRow('AO');
    const ctTokens = makeCtTokens(['99', '22', '11']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      { A: ['11'], O: ['22'] },
      undefined,
      1,
    );

    expect(columns).toHaveLength(1);

    // A cannot skip over O's hard-locked token (22) to reach 11.
    expect(columns[0][0].pt?.ch).toBe('A');
    expect(columns[0][0].ct).toEqual([0]);
    expect(columns[0][0].tentative).toBe(true);

    expect(columns[0][1].pt?.ch).toBe('O');
    expect(columns[0][1].ct).toEqual([1]);
    expect(columns[0][1].tentative).toBeUndefined();

    expect(columns[0][2].pt).toBeNull();
    expect(columns[0][2].deception).toBe(true);
    expect(columns[0][2].ct).toEqual([2]);
  });

  it('limits lookahead to one skipped group and keeps farther mismatch tentative', () => {
    const ptRows = makePtRow('AHH');
    const ctTokens = makeCtTokens(['11', '44', '66', '22']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      { A: ['11'], H: ['22'] },
      undefined,
      1,
    );

    expect(columns).toHaveLength(1);

    expect(columns[0][0].pt?.ch).toBe('A');
    expect(columns[0][0].ct).toEqual([0]);

    // With lookahead disabled, first H consumes sequentially without scanning.
    expect(columns[0][1].pt?.ch).toBe('H');
    expect(columns[0][1].ct).toEqual([1]);
    expect(columns[0][1].tentative).toBe(true);

    // Second H also consumes sequentially (no lookahead).
    expect(columns[0][2].pt?.ch).toBe('H');
    expect(columns[0][2].ct).toEqual([2]);
    expect(columns[0][2].tentative).toBe(true);

    // Leftover token becomes deception.
    expect(columns[0][3].pt).toBeNull();
    expect(columns[0][3].deception).toBe(true);
    expect(columns[0][3].ct).toEqual([3]);
  });
});
