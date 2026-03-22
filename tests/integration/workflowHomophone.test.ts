import { describe, it, expect, beforeEach } from 'vitest';
import { parseSeparatorRaw } from '../../src/utils/parse/separator';
import { analyze } from '../../src/utils/analyzer';
import { buildMultiKeyColumns } from '../../src/utils/multiKeyMapping';
import { resetIds, ptRow, OPTS_MULTI, assertAnalysisInvariants } from '../helpers';
import type { PTChar } from '../../src/types/domain';

beforeEach(() => resetIds());

describe('Integration: homophone (multi-key) workflow', () => {
  const RAW_ZT = '11:22:11:99:33:66';
  const SEPARATOR = ':';
  const OT_TEXT = 'AHAHO';

  function setup() {
    const ptRows: PTChar[][] = [ptRow(...OT_TEXT.split(''))];
    const parsed = parseSeparatorRaw(RAW_ZT, SEPARATOR, OT_TEXT.length);
    const ctTokens = parsed.tokens;
    const rowGroups = [[2, 1, 1, 1, 1]]; // sums to 6
    return { ptRows, parsed, ctTokens, rowGroups };
  }

  it('filters far-away token candidates by deception range in multi-key analysis', () => {
    const { ptRows, ctTokens, rowGroups } = setup();

    const result = analyze(ptRows, ctTokens, rowGroups, OPTS_MULTI);

    const candA = result.candidatesByChar['A'] ?? [];
    const candO = result.candidatesByChar['O'] ?? [];

    // Token 66 appears at the end and should be out of range for A (positions 0 and 2)
    // when deceptionCount is 1, but still in range for O (position 4).
    expect(candA.some(c => c.token === '66')).toBe(false);
    expect(candO.some(c => c.token === '66')).toBe(true);
    assertAnalysisInvariants(result, ctTokens.length);
  });

  it('preserves array locks and maps columns without crossing foreign hard-locks', () => {
    const { ptRows, ctTokens, rowGroups } = setup();
    const locked = { A: ['11'], H: ['22', '33'] };

    const analyzed = analyze(ptRows, ctTokens, rowGroups, OPTS_MULTI, locked);
    expect(analyzed.proposedLocks['A']).toEqual(['11']);
    expect(analyzed.proposedLocks['H']).toEqual(['22', '33']);
    assertAnalysisInvariants(analyzed, ctTokens.length);

    const columns = buildMultiKeyColumns(ptRows, ctTokens, locked, { O: ['66'] }, 1);

    expect(columns).toHaveLength(1);

    // A keeps both occurrences on its locked token.
    expect(columns[0][0].pt?.ch).toBe('A');
    expect(columns[0][0].ct).toEqual([0]);
    expect(columns[0][2].pt?.ch).toBe('A');
    expect(columns[0][2].ct).toEqual([2]);

    // H occurrences consume 22 then 33 in order.
    expect(columns[0][1].pt?.ch).toBe('H');
    expect(columns[0][1].ct).toEqual([1]);
    expect(columns[0][4].pt?.ch).toBe('H');
    expect(columns[0][4].ct).toEqual([4]);

    // H local-lookahead skips 99 as deception and confirms 33.
    expect(columns[0][3].pt).toBeNull();
    expect(columns[0][3].deception).toBe(true);
    expect(columns[0][3].ct).toEqual([3]);

    // O then confirms its selected token 66.
    expect(columns[0][5].pt?.ch).toBe('O');
    expect(columns[0][5].ct).toEqual([5]);
  });
});
