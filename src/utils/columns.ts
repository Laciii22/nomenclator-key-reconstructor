import type { ZTToken } from '../types/domain';

export type Pair = { ot: string; zt: string };

type ColumnLike = { ot: { ch: string } | null; zt: number[] } & Record<string, any>;

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
