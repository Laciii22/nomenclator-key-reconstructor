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
    let remaining = totalZT - allocated;
    if (remaining > 0) {
        const order = info.map((x, i) => ({ i, frac: x.frac })).sort((a, b) => b.frac - a.frac);
        let j = 0;
        while (remaining > 0 && order.length > 0) {
        info[order[j].i].alloc += 1;
        remaining--;
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

    export function computeFixedGroups(rows: OTChar[][], tokens: ZTToken[], perOT: number) {
    const groups: number[][] = [];
    let remain = tokens.length;
    for (let r = 0; r < rows.length; r++) {
        const otCells = rows[r].filter(c => c.ch !== '');
        const row: number[] = [];
        for (let c = 0; c < otCells.length; c++) {
        const take = Math.min(perOT, remain);
        row.push(take);
        remain -= take;
        }
        groups.push(row);
    }
    return groups;
    }

    /**
     * This function applies a maximum cap on the number of tokens per OT cell,
     * and redistributes any excess tokens to other cells that are below the cap.
     * @param groups 2D array indicating current allocation of tokens to OT cells.
     * @param totalTokens Total number of ZT tokens to be allocated.
     * @param cap Maximum number of tokens allowed per OT cell.
     * @return An object containing:
     * - groups: The adjusted 2D array after applying the cap and redistribution.
     * - unplaced: The number of tokens that could not be placed.
     */

    export function applyCapWithRedistribution(groups: number[][], totalTokens: number, cap: number): { groups: number[][]; unplaced: number } {
    const clipped = groups.map(row => row.map(g => Math.min(g, cap)));
    const capacity = clipped.reduce((acc, row) => acc + row.reduce((a, b) => a + (cap - b), 0), 0);
    const currentSum = groups.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0);
    let toRedistribute = Math.max(0, currentSum - clipped.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0));
    let r = 0, c = 0;
    const rowsCount = clipped.length;
    const rowLens = clipped.map(row => row.length);
    while (toRedistribute > 0 && capacity > 0) {
        if (rowLens[r] && clipped[r][c] < cap) {
        clipped[r][c] += 1;
        toRedistribute -= 1;
        }
        const len = rowLens[r] || 1;
        c = (c + 1) % len;
        if (c === 0) r = (r + 1) % rowsCount;
    }
    const finalSum = clipped.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0);
    const unplaced = Math.max(0, totalTokens - finalSum);
    return { groups: clipped, unplaced };
    }


    /**
     * This function computes the OT keys for the given rows, tokens, and groups.
     * @param rows 2D array of OT characters.
     * @param tokens Array of ZT tokens.
     * @param groups 2D array indicating current allocation of tokens to OT cells.
     * @returns A map where each key is an OT character and the value is a set of corresponding ZT strings.
     * 
     */
    export function computeOTKeys(rows: OTChar[][], tokens: ZTToken[], groups: number[][]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    let cursor = 0;
    for (let r = 0; r < rows.length; r++) {
        const otRow = rows[r].filter(c => c.ch !== '');
        const sizes = (groups[r] || []).slice(0, otRow.length);
        while (sizes.length < otRow.length) sizes.push(0);
        for (let c = 0; c < otRow.length; c++) {
        const take = Math.max(0, Math.min(tokens.length - cursor, sizes[c]));
        const group = tokens.slice(cursor, cursor + take);
        cursor += take;
        const ot = otRow[c]?.ch;
        if (!ot) continue;
        const ztStr = group.map(z => z.text).join('');
        if (!result.has(ot)) result.set(ot, new Set());
        if (ztStr) result.get(ot)!.add(ztStr);
        }
    }
    return result;
    }
