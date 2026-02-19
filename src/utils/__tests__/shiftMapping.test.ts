import { describe, it, expect } from 'vitest';
import { buildShiftOnlyColumns } from '../shiftMapping';
import type { OTChar, ZTToken } from '../../types/domain';

describe('buildShiftOnlyColumns', () => {
  it('should skip tokens forced for other characters and create deception cells', () => {
    // OT: ABBAHO
    const otRows: OTChar[][] = [
      [
        { ch: 'A', raw: 'A' },
        { ch: 'B', raw: 'B' },
        { ch: 'B', raw: 'B' },
        { ch: 'A', raw: 'A' },
        { ch: 'H', raw: 'H' },
        { ch: 'O', raw: 'O' },
      ]
    ];
    
    // ZT: 11:344:11:22:33
    const ztTokens: ZTToken[] = [
      { text: '11', raw: '11' },
      { text: '344', raw: '344' },
      { text: '11', raw: '11' },
      { text: '22', raw: '22' },
      { text: '33', raw: '33' },
    ];
    
    // Selection: A→11
    const selections = { A: '11' };
    
    const columns = buildShiftOnlyColumns(otRows, ztTokens, {}, selections, 1);
    
    // Expected:
    // A → 11 (index 0)
    // B → 344 (index 1)
    // B → (empty) - can't take index 2 because "11" is forced for A
    // A → 11 (index 2)
    // H → 22 (index 3)
    // O → 33 (index 4)
    
    expect(columns).toHaveLength(1); // one row
    const row = columns[0];
    
    // A should get first "11" (index 0)
    expect(row[0]).toEqual({ ot: { ch: 'A', raw: 'A' }, zt: [0] });
    
    // B should get "344" (index 1)
    expect(row[1]).toEqual({ ot: { ch: 'B', raw: 'B' }, zt: [1] });
    
    // Second B gets empty (can't take "11" at index 2 because it's forced for A)
    expect(row[2]).toEqual({ ot: { ch: 'B', raw: 'B' }, zt: [] });
    
    // Second A should get second "11" (index 2)
    expect(row[3]).toEqual({ ot: { ch: 'A', raw: 'A' }, zt: [2] });
    
    // H should get "22" (index 3)
    expect(row[4]).toEqual({ ot: { ch: 'H', raw: 'H' }, zt: [3] });
    
    // O should get "33" (index 4)
    expect(row[5]).toEqual({ ot: { ch: 'O', raw: 'O' }, zt: [4] });
  });
});
