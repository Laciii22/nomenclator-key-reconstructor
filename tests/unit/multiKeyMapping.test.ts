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

  it('keeps single-token lock mismatches empty instead of forcing tentative consumption', () => {
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

    const aCells = columns[0].filter(c => c.pt?.ch === 'A');
    const hCells = columns[0].filter(c => c.pt?.ch === 'H');
    const oCells = columns[0].filter(c => c.pt?.ch === 'O');
    const deception = columns[0].filter(c => c.deception);

    expect(aCells).toHaveLength(2);
    expect(aCells[0].ct).toEqual([0]);
    expect(aCells[1].ct).toEqual([2]);

    expect(hCells).toHaveLength(2);
    expect(hCells[0].ct).toEqual([]);
    expect(hCells[1].ct).toEqual([3]);

    expect(oCells).toHaveLength(1);
    expect(oCells[0].ct).toEqual([4]);

    expect(deception).toHaveLength(1);
    expect(deception[0].ct).toEqual([1]);
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

  it('stops lookahead at foreign hard-lock boundary and keeps mismatch empty', () => {
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

    const aCells = columns[0].filter(c => c.pt?.ch === 'A');
    const oCells = columns[0].filter(c => c.pt?.ch === 'O');
    const deception = columns[0].filter(c => c.deception);

    // A cannot skip over O's boundary, so A stays empty.
    expect(aCells).toHaveLength(1);
    expect(aCells[0].ct).toEqual([]);

    // O still gets its locked token 22.
    expect(oCells).toHaveLength(1);
    expect(oCells[0].ct).toEqual([1]);

    // 99 (index 0) is skipped as deception; trailing 11 (index 2) remains deception.
    expect(deception).toHaveLength(2);
    expect(deception[0].ct).toEqual([0]);
    expect(deception[1].ct).toEqual([2]);
  });

  it('keeps repeated single-token lock mismatches empty until match appears', () => {
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

    // With strict single-token pairing, first H stays empty on mismatch.
    expect(columns[0][1].pt?.ch).toBe('H');
    expect(columns[0][1].ct).toEqual([]);

    // Second H also stays empty while token still mismatches.
    expect(columns[0][2].pt?.ch).toBe('H');
    expect(columns[0][2].ct).toEqual([]);

    // Remaining CT groups become deception.
    expect(columns[0][3].pt).toBeNull();
    expect(columns[0][3].deception).toBe(true);
    expect(columns[0][3].ct).toEqual([1]);

    expect(columns[0][4].pt).toBeNull();
    expect(columns[0][4].deception).toBe(true);
    expect(columns[0][4].ct).toEqual([2]);

    expect(columns[0][5].pt).toBeNull();
    expect(columns[0][5].deception).toBe(true);
    expect(columns[0][5].ct).toEqual([3]);
  });

  it('keeps non-owner cell empty and maps equal-count selected token by occurrence order', () => {
    const ptRows = makePtRow('OPP');
    const ctTokens = makeCtTokens(['63', '63']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      undefined,
      { P: ['63'] },
      1,
    );

    expect(columns).toHaveLength(1);
    expect(columns[0]).toHaveLength(3);

    // Reserved token 63 should not be consumed by the preceding non-owner cell.
    expect(columns[0][0].pt?.ch).toBe('O');
    expect(columns[0][0].ct).toEqual([]);

    // Equal-count occurrences are assigned deterministically in order.
    expect(columns[0][1].pt?.ch).toBe('P');
    expect(columns[0][1].ct).toEqual([0]);
    expect(columns[0][1].tentative).toBeUndefined();

    expect(columns[0][2].pt?.ch).toBe('P');
    expect(columns[0][2].ct).toEqual([1]);
    expect(columns[0][2].tentative).toBeUndefined();

    // No extra null/deception chain in equal-count pairing path.
    expect(columns[0].some(c => c.deception)).toBe(false);
  });

  it('keeps locked cell empty on mismatch when future exact matches are sufficient', () => {
    const ptRows = makePtRow('PHP');
    const ctTokens = makeCtTokens(['53', '63', '63']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      undefined,
      { P: ['63'] },
      1,
      0,
    );

    expect(columns).toHaveLength(1);

    const pCells = columns[0].filter(c => c.pt?.ch === 'P');
    const hCells = columns[0].filter(c => c.pt?.ch === 'H');
    const deception = columns[0].filter(c => c.deception);

    expect(pCells).toHaveLength(2);
    expect(pCells[0].ct).toEqual([1]);
    expect(pCells[1].ct).toEqual([2]);

    // H must not steal 63 while P still has remaining occurrence.
    expect(hCells).toHaveLength(1);
    expect(hCells[0].ct).toEqual([]);

    expect(deception).toHaveLength(1);
    expect(deception[0].ct).toEqual([0]);
  });

  it('shifts deterministically for equal PT/CT count single-token mapping', () => {
    const ptRows = makePtRow('PO');
    const ctTokens = makeCtTokens(['99', '63', '88']);

    const columns = buildMultiKeyColumns(
      ptRows,
      ctTokens,
      undefined,
      { P: ['63'] },
      1,
      2,
    );

    expect(columns).toHaveLength(1);

    const pCells = columns[0].filter(c => c.pt?.ch === 'P');
    const oCells = columns[0].filter(c => c.pt?.ch === 'O');
    const deception = columns[0].filter(c => c.deception);

    // P count (1) equals 63 count (1), so P must get the matching 63.
    expect(pCells).toHaveLength(1);
    expect(pCells[0].ct).toEqual([1]);

    // O consumes next available token.
    expect(oCells).toHaveLength(1);
    expect(oCells[0].ct).toEqual([2]);

    // Skipped non-matching token becomes deception.
    expect(deception).toHaveLength(1);
    expect(deception[0].ct).toEqual([0]);
  });
});
