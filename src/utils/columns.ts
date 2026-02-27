/**
 * Utilities for working with the PT/CT allocation grid columns.
 * Converts grid allocations into PT→CT pairs for analysis and display.
 */

import type { CTToken } from '../types/domain';

/** An PT→CT pair extracted from the grid */
export type Pair = { pt: string; ct: string };

/** Column-like structure compatible with various grid representations */
type ColumnLike = { pt: { ch: string } | null; ct: number[] };

/**
 * Extract all PT→CT pairs from the allocation grid.
 * 
 * @param cols The allocation grid columns
 * @param ctTokens All CT tokens for lookup
 * @param groupSize Size of token groups (1 for separator, >1 for fixed-length)
 * @param keysPerPTMode Keys per PT mode: 'single' or 'multiple' (homophones)
 * @returns Array of PT→CT pairs (one per column)
 */
export function computePairsFromColumns(
  cols: ColumnLike[][],
  ctTokens: CTToken[],
  groupSize: number = 1,
  keysPerPTMode: 'single' | 'multiple' = 'single'
): Pair[] {
  // Currently pairs are computed per cell regardless of mode.
  // Keep the parameter for API stability (call sites pass it).
  void keysPerPTMode;
  const out: Pair[] = [];
  for (const row of cols) {
    for (const col of row) {
      if (!col.pt) continue;
      
      // In multi-key mode, each column represents one (PT, CT) pair
      // In single-key mode, join tokens according to groupSize
      const text = (groupSize === 1)
        ? (() => {
            const idx = col.ct.length ? col.ct[0] : null;
            return idx != null ? (ctTokens[idx]?.text || '') : '';
          })()
        : col.ct.map((i: number) => ctTokens[i]?.text || '').join('');
      out.push({ pt: col.pt.ch, ct: text });
    }
  }
  return out;
}

/**
 * Aggregate pairs by PT character, collecting unique CT tokens.
 * 
 * In 'single' mode: shows only the first non-empty token per PT.
 * In 'multiple' mode: shows all unique tokens per PT.
 * 
 * @param pairs Array of PT→CT pairs
 * @param keysPerPTMode Whether to show single or multiple keys per PT
 * @returns Aggregated view with unique token counts
 */
export function aggregatePairsByOT(pairs: Pair[], keysPerPTMode: 'single' | 'multiple' = 'multiple') {
  const map = new Map<string, { allSet: Set<string>; nonEmptySet: Set<string>; displayList: string[] }>();
  const order: string[] = [];
  for (const p of pairs) {
    if (!map.has(p.pt)) {
      map.set(p.pt, { allSet: new Set(), nonEmptySet: new Set(), displayList: [] });
      order.push(p.pt);
    }
    const entry = map.get(p.pt)!;
    const tokenText = p.ct;
    if (!entry.allSet.has(tokenText)) entry.allSet.add(tokenText);
    if (tokenText !== '' && !entry.nonEmptySet.has(tokenText)) entry.nonEmptySet.add(tokenText);
    if (keysPerPTMode === 'single') {
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
  return order.map(pt => {
    const entry = map.get(pt)!;
    const uniqueCountNonEmpty = entry.nonEmptySet.size;
    const dl = entry.displayList.filter(v => !(v === '' && uniqueCountNonEmpty > 0));
    return { pt, ctList: dl, uniqueCount: uniqueCountNonEmpty };
  });
}
