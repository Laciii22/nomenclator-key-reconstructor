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
    
    export function computeRowAlloc(rows: OTChar[][], tokens: ZTToken[]) {
    const totalOT = rows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const totalZT = tokens.length;
    if (totalOT === 0) return { rowAlloc: rows.map(() => 0), groups: rows.map(() => [] as number[]) };
    const ratio = totalZT / totalOT;
    const info = rows.map(r => ({ otCount: r.filter(c => c.ch !== '').length, frac: 0, alloc: 0 }));
    let allocated = 0;
    for (const inf of info) {
        const exact = inf.otCount * ratio;
        const base = Math.floor(exact);
        inf.alloc = base;
        inf.frac = exact - base;
        allocated += base;
    }
    allocated = Math.min(allocated, totalOT);
    let remaining = totalZT - allocated;
    if (remaining > 0) {
        const order = info.map((x, i) => ({ i, frac: x.frac })).sort((a, b) => b.frac - a.frac);
        let j = 0;
        while (remaining > 0 && allocated < totalOT && order.length > 0) {
        info[order[j].i].alloc += 1;
        allocated += 1;
        remaining -= 1;
        j = (j + 1) % order.length;
        }
    }
    const rowAlloc = info.map(x => x.alloc);
    const groups = rows.map((r, idx) => {
        const otCells = r.filter(c => c.ch !== '');
        const oc = otCells.length;
        if (oc === 0) return [] as number[];
        const count = rowAlloc[idx];
        const base = Math.floor(count / oc);
        let rem = count % oc;
        const arr: number[] = [];
        for (let k = 0; k < oc; k++) {
        const g = base + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        arr.push(g);
        }
        return arr;
    });
    return { rowAlloc, groups };
    }

    /**
     * This function is responsible for dividing zt tokens among ot rows with a fixed number per ot cell.
     * @param rows 2D array of OT characters.
     * @param tokens Array of ZT tokens.
     * @param perOT Number of tokens to allocate per OT cell.
     * @returns A 2D array indicating how many tokens are allocated to each OT cell.
     * 
    */

