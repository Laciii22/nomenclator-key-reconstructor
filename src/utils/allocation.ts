/**
 * Token allocation algorithm for distributing ZT tokens across OT grid cells.
 * 
 * Uses a round-robin distribution strategy to allocate tokens evenly.
 * In fixed-length mode, allocates token groups instead of individual tokens.
 */

import type { OTChar, ZTToken } from '../components/types';

/**
 * Compute how many ZT tokens/groups should be allocated to each OT cell.
 * 
 * @param rows OT character rows (empty chars are filtered out)
 * @param tokens ZT tokens to distribute
 * @param groupSize Size of token groups (1 for separator mode, >1 for fixed-length)
 * @returns Row-wise allocation counts and per-cell group sizes
 */
export function computeRowAlloc(rows: OTChar[][], tokens: ZTToken[], groupSize: number = 1) {
  const otCellsPerRow = rows.map(r => r.filter(c => c.ch !== ''));
  const flatCount = otCellsPerRow.reduce((acc, r) => acc + r.length, 0);
  const totalZT = tokens.length;
  if (flatCount === 0) return { rowAlloc: rows.map(() => 0), groups: rows.map(() => [] as number[]) };

  // number of "groups" to distribute: each group is groupSize tokens (for fixedLength),
  // or each token is its own group when groupSize === 1
  const totalGroups = groupSize > 1 ? Math.floor(totalZT / groupSize) : totalZT;
  const cellCount = flatCount;
  const assignCountsFlat = new Array<number>(cellCount).fill(0);

  // distribute groups round-robin (simple, predictable)
  let remaining = totalGroups;
  let idx = 0;
  while (remaining > 0) {
    assignCountsFlat[idx] += groupSize > 1 ? groupSize : 1;
    remaining--;
    idx = (idx + 1) % cellCount;
  }

  // build per-row groups and rowAlloc
  const groups = [];
  const rowAlloc = [];
  let ptr = 0;
  for (const rowCells of otCellsPerRow) {
    const rowArr: number[] = [];
    for (let i = 0; i < rowCells.length; i++) {
      rowArr.push(assignCountsFlat[ptr++] || 0);
    }
    groups.push(rowArr);
    rowAlloc.push(rowArr.reduce((s, v) => s + v, 0));
  }

  return { rowAlloc, groups };
}

