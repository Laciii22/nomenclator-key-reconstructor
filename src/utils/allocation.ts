    import type { OTChar, ZTToken } from '../components/types';


    /**
     * This function is dividing ZT tokens among OT rows proportionally to the number of OT characters in each row.
     * TODO Probably will be changed later to a more sophisticated algorithm.
     * @param rows 2D array of OT characters.
     * @param tokens Array of ZT tokens.
     * @returns An object containing:
     * - rowAlloc: Array indicating how many tokens are allocated to each row.
     * - groups: 2D array indicating how many tokens are allocated to each OT cell. 
     *
    **/
    
    // export function computeRowAlloc(rows: OTChar[][], tokens: ZTToken[]) {
    // const totalOT = rows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    // const totalZT = tokens.length;
    // if (totalOT === 0) return { rowAlloc: rows.map(() => 0), groups: rows.map(() => [] as number[]) };
    // const ratio = totalZT / totalOT;
    // const info = rows.map(r => ({ otCount: r.filter(c => c.ch !== '').length, frac: 0, alloc: 0 }));
    // let allocated = 0;
    // for (const inf of info) {
    //     const exact = inf.otCount * ratio;
    //     const base = Math.floor(exact);
    //     inf.alloc = base;
    //     inf.frac = exact - base;
    //     allocated += base;
    // }
    // allocated = Math.min(allocated, totalOT);
    // let remaining = totalZT - allocated;
    // if (remaining > 0) {
    //     const order = info.map((x, i) => ({ i, frac: x.frac })).sort((a, b) => b.frac - a.frac);
    //     let j = 0;
    //     while (remaining > 0 && allocated < totalOT && order.length > 0) {
    //     info[order[j].i].alloc += 1;
    //     allocated += 1;
    //     remaining -= 1;
    //     j = (j + 1) % order.length;
    //     }
    // }
    // const rowAlloc = info.map(x => x.alloc);
    // const groups = rows.map((r, idx) => {
    //     const otCells = r.filter(c => c.ch !== '');
    //     const oc = otCells.length;
    //     if (oc === 0) return [] as number[];
    //     const count = rowAlloc[idx];
    //     const base = Math.floor(count / oc);
    //     let rem = count % oc;
    //     const arr: number[] = [];
    //     for (let k = 0; k < oc; k++) {
    //     const g = base + (rem > 0 ? 1 : 0);
    //     if (rem > 0) rem--;
    //     arr.push(g);
    //     }
    //     return arr;
    // });
    // return { rowAlloc, groups };
    // }

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

