/**
 * Utilities for working with the OT/ZT allocation grid columns.
 * Converts grid allocations into OT→ZT pairs for analysis and display.
 */

import type { ZTToken } from '../types/domain';

/** An OT→ZT pair extracted from the grid */
export type Pair = { ot: string; zt: string };

/** Column-like structure compatible with various grid representations */
type ColumnLike = { ot: { ch: string } | null; zt: number[] };

/**
 * Extract all OT→ZT pairs from the allocation grid.
 * 
 * @param cols The allocation grid columns
 * @param ztTokens All ZT tokens for lookup
 * @param groupSize Size of token groups (1 for separator, >1 for fixed-length)
 * @returns Array of OT→ZT pairs (one per OT cell)
 */
export function computePairsFromColumns(
  cols: ColumnLike[][],
  ztTokens: ZTToken[],
  groupSize: number = 1
): Pair[] {
  const out: Pair[] = [];
  for (const row of cols) {
    for (const col of row) {
      if (!col.ot) continue;
      const text = (groupSize === 1)
        ? (() => {
            const idx = col.zt.length ? col.zt[0] : null;
            return idx != null ? (ztTokens[idx]?.text || '') : '';
          })()
        : col.zt.map((i: number) => ztTokens[i]?.text || '').join('');
      out.push({ ot: col.ot.ch, zt: text });
    }
  }
  return out;
}

/**
 * Aggregate pairs by OT character, collecting unique ZT tokens.
 * 
 * In 'single' mode: shows only the first non-empty token per OT.
 * In 'multiple' mode: shows all unique tokens per OT.
 * 
 * @param pairs Array of OT→ZT pairs
 * @param keysPerOTMode Whether to show single or multiple keys per OT
 * @returns Aggregated view with unique token counts
 */
export function aggregatePairsByOT(pairs: Pair[], keysPerOTMode: 'single' | 'multiple' = 'multiple') {
  const map = new Map<string, { allSet: Set<string>; nonEmptySet: Set<string>; displayList: string[] }>();
  const order: string[] = [];
  for (const p of pairs) {
    if (!map.has(p.ot)) {
      map.set(p.ot, { allSet: new Set(), nonEmptySet: new Set(), displayList: [] });
      order.push(p.ot);
    }
    const entry = map.get(p.ot)!;
    const tokenText = p.zt;
    if (!entry.allSet.has(tokenText)) entry.allSet.add(tokenText);
    if (tokenText !== '' && !entry.nonEmptySet.has(tokenText)) entry.nonEmptySet.add(tokenText);
    if (keysPerOTMode === 'single') {
      if (entry.displayList.length === 0) entry.displayList.push(tokenText);
      else if (entry.displayList[0] === '' && tokenText !== '') entry.displayList[0] = tokenText;
    } else {
      if (tokenText === '') {
        if (entry.displayList.length === 0) entry.displayList.push('');
      } else if (!entry.displayList.includes(tokenText)) {
        entry.displayList.push(tokenText);
      }
    }
  }
  return order.map(ot => {
    const entry = map.get(ot)!;
    const uniqueCountNonEmpty = entry.nonEmptySet.size;
    const dl = entry.displayList.filter(v => !(v === '' && uniqueCountNonEmpty > 0));
    return { ot, ztList: dl, uniqueCount: uniqueCountNonEmpty };
  });
}
