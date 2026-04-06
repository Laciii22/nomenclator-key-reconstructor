import { describe, expect, it } from 'vitest';
import { computeInsertRawCharsAfterPosition } from '../../src/hooks/nomenclator/insertRawAfterPosition';

describe('computeInsertRawCharsAfterPosition', () => {
  it('auto-brackets inserted fixed-length chars when their token text is already bracketed', () => {
    const res = computeInsertRawCharsAfterPosition({
      positionIndex: 0,
      text: '99',
      replace: true,
      ctParseMode: 'fixedLength',
      separator: ':',
      ctTokens: [{ text: '9' }, { text: '1' }, { text: '2' }],
      bracketedIndices: [0],
      columns: [[{ pt: { ch: 'A' }, ct: [0, 1] }]],
    });

    expect(res).not.toBeNull();
    expect(res!.nextRaw).toBe('999');
    expect(res!.nextBracketedIndices).toEqual([0, 1, 2]);
  });

  it('keeps inserted separator-mode token bracketed when the same text is already bracketed', () => {
    const res = computeInsertRawCharsAfterPosition({
      positionIndex: 0,
      text: '9',
      replace: true,
      ctParseMode: 'separator',
      separator: ':',
      ctTokens: [{ text: '9' }, { text: '7' }, { text: '8' }],
      bracketedIndices: [0],
      columns: [[{ pt: { ch: 'A' }, ct: [0, 1] }]],
    });

    expect(res).not.toBeNull();
    expect(res!.nextRaw).toBe('9:9');
    expect(res!.nextBracketedIndices).toEqual([0, 1]);
  });
});
