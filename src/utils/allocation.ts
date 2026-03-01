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
  const ptCellsPerRow = rows.map(r => r.filter(c => c.ch !== ''));
  const flatCount = ptCellsPerRow.reduce((acc, r) => acc + r.length, 0);
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
  for (const rowCells of ptCellsPerRow) {
    const rowArr: number[] = [];
    for (let i = 0; i < rowCells.length; i++) {
      rowArr.push(assignCountsFlat[ptr++] || 0);
    }
    groups.push(rowArr);
    rowAlloc.push(rowArr.reduce((s, v) => s + v, 0));
  }

  return { rowAlloc, groups };
}

