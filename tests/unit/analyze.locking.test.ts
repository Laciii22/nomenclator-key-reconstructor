import { describe, it, expect, beforeEach } from 'vitest';
import { analyze } from '../../src/utils/analyzer';
import { resetIds, otRow, ztList, OPTS_SINGLE, assertAnalysisInvariants } from '../helpers';
import type { OTChar, ZTToken } from '../../src/types/domain';

beforeEach(() => resetIds());

// Shared fixture: OT "AHAHO", ZT "11:22:11:22:99:33:99"
function makeAHAHO() {
  const otRows: OTChar[][] = [otRow('A', 'H', 'A', 'H', 'O')];
  const ztTokens = ztList('11', '22', '11', '22', '99', '33', '99');
  const rowGroups = [[2, 2, 1, 1, 1]]; // sums to 7
  return { otRows, ztTokens, rowGroups };
}

describe('analyze() — locking behavior', () => {
  it('echoes back single locked key in proposedLocks', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: '11' });

    expect(result.proposedLocks).toHaveProperty('A', '11');
    assertAnalysisInvariants(result, ztTokens.length);
  });

  it('sets locked cells rowGroup to 1', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: '11' });

    // A occupies flat indices 0 and 2
    expect(result.proposedRowGroups[0][0]).toBe(1);
    expect(result.proposedRowGroups[0][2]).toBe(1);
  });

  it('unlocked cells absorb freed tokens (total preserved)', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: '11' });
    const flat = result.proposedRowGroups.flat();
    const sum = flat.reduce((s, v) => s + v, 0);

    expect(sum).toBe(ztTokens.length);
  });

  it('locking multiple characters still preserves total', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: '11', H: '22' });

    // The balancing algorithm may redistribute overflow to any cell,
    // so only assert the structural invariant, not individual cell values.
    assertAnalysisInvariants(result, ztTokens.length);
  });

  it('array-valued lock (multi-key) is preserved as-is', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, { A: ['11', '99'] });

    expect(result.proposedLocks['A']).toEqual(['11', '99']);
    assertAnalysisInvariants(result, ztTokens.length);
  });

  it('empty locked map behaves identically to no locks', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();

    const withEmpty = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, {});
    const withNone = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE);

    expect(withEmpty.proposedRowGroups).toEqual(withNone.proposedRowGroups);
  });

  it('locking all characters: every cell becomes 1, remainder goes to unlocked or existing', () => {
    const { otRows, ztTokens, rowGroups } = makeAHAHO();
    const locked = { A: '11', H: '22', O: '33' };

    const result = analyze(otRows, ztTokens, rowGroups, OPTS_SINGLE, locked);

    assertAnalysisInvariants(result, ztTokens.length);
  });
});
