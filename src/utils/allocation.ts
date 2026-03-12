/**
 * Token allocation algorithm for distributing CT tokens across PT grid cells.
 * 
 * Uses a round-robin distribution strategy to allocate tokens evenly.
 * In fixed-length mode, allocates token groups instead of individual tokens.
 */

import type { PTChar, CTToken } from '../types/domain';

/**
 * Compute how many CT tokens/groups should be allocated to each PT cell.
 * 
 * @param rows PT character rows (empty chars are filtered out)
 * @param tokens CT tokens to distribute
 * @param groupSize Size of token groups (1 for separator mode, >1 for fixed-length)
 * @returns Row-wise allocation counts and per-cell group sizes
 */
export function computeRowAlloc(rows: PTChar[][], tokens: CTToken[], groupSize: number = 1) {
  const nonEmptyCellsPerRow = rows.map(r => r.filter(c => c.ch !== ''));
  const totalCells = nonEmptyCellsPerRow.reduce((acc, r) => acc + r.length, 0);

  if (totalCells === 0) {
    return { rowAlloc: rows.map(() => 0), groups: rows.map(() => [] as number[]) };
  }

  const tokensPerGroup = groupSize > 1 ? groupSize : 1;
  const totalGroups = groupSize > 1 ? Math.floor(tokens.length / groupSize) : tokens.length;

  // Round-robin: distribute groups evenly across all PT cells
  const assignCountsFlat = new Array<number>(totalCells).fill(0);
  for (let g = 0; g < totalGroups; g++) {
    assignCountsFlat[g % totalCells] += tokensPerGroup;
  }

  // Partition flat assignments back into per-row groups
  const groups: number[][] = [];
  const rowAlloc: number[] = [];
  let ptr = 0;
  for (const rowCells of nonEmptyCellsPerRow) {
    const rowArr: number[] = [];
    for (let i = 0; i < rowCells.length; i++) {
      rowArr.push(assignCountsFlat[ptr++] || 0);
    }
    groups.push(rowArr);
    rowAlloc.push(rowArr.reduce((sum, v) => sum + v, 0));
  }

  return { rowAlloc, groups };
}

