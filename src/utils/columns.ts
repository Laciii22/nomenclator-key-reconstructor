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
 */
export function computePairsFromColumns(
  cols: ColumnLike[][],
  ctTokens: CTToken[],
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
      const text = col.ct.map((i: number) => ctTokens[i]?.text || '').join('');
      out.push({ pt: col.pt.ch, ct: text });
    }
  }
  return out;
}

/** Tracking state for one PT character during aggregation. */
type AggEntry = { allSet: Set<string>; nonEmptySet: Set<string>; displayList: string[] };

/** Add a token to the display list for single-key mode (first non-empty wins). */
function addSingleKeyDisplay(entry: AggEntry, token: string): void {
  if (entry.displayList.length === 0) {
    entry.displayList.push(token);
  } else if (entry.displayList[0] === '' && token !== '') {
    entry.displayList[0] = token;
  }
}

/** Add a token to the display list for multi-key mode (all unique non-empty). */
function addMultiKeyDisplay(entry: AggEntry, token: string): void {
  if (token === '') {
    if (entry.displayList.length === 0) entry.displayList.push('');
  } else if (!entry.displayList.includes(token)) {
    entry.displayList.push(token);
  }
}

/**
 * Aggregate pairs by PT character, collecting unique CT tokens.
 * 
 * In 'single' mode: shows only the first non-empty token per PT.
 * In 'multiple' mode: shows all unique tokens per PT.
 */
export function aggregatePairsByOT(pairs: Pair[], keysPerPTMode: 'single' | 'multiple' = 'multiple') {
  const map = new Map<string, AggEntry>();
  const order: string[] = [];
  const addDisplay = keysPerPTMode === 'single' ? addSingleKeyDisplay : addMultiKeyDisplay;

  for (const p of pairs) {
    if (!map.has(p.pt)) {
      map.set(p.pt, { allSet: new Set(), nonEmptySet: new Set(), displayList: [] });
      order.push(p.pt);
    }
    const entry = map.get(p.pt)!;
    entry.allSet.add(p.ct);
    if (p.ct !== '') entry.nonEmptySet.add(p.ct);
    addDisplay(entry, p.ct);
  }

  return order.map(pt => {
    const entry = map.get(pt)!;
    const uniqueCountNonEmpty = entry.nonEmptySet.size;
    const dl = entry.displayList.filter(v => !(v === '' && uniqueCountNonEmpty > 0));
    return { pt, ctList: dl, uniqueCount: uniqueCountNonEmpty };
  });
}
