import React, { useMemo } from 'react';
import type { Column, KeyTableProps, OTChar, Pair, ZTToken } from '../types';



function distributeRow(otRow: OTChar[], ztRowCount: number, takeFrom: ZTToken[], cursor: { i: number }): Column[] {
  const otCells = otRow.filter(c => c.ch !== '');
  const oc = otCells.length;
  if (oc === 0) return [];
  const base = Math.floor(ztRowCount / oc);
  let rem = ztRowCount % oc;
  const cols: Column[] = [];
  for (let k = 0; k < oc; k++) {
    const groupSize = base + (rem > 0 ? 1 : 0);
    const start = cursor.i;
    const end = start + groupSize;
    const group = takeFrom.slice(start, end);
    cursor.i = end;
    if (rem > 0) rem--;
    cols.push({ ot: otCells[k], zt: group });
  }
  return cols;
}

const KeyTable: React.FC<KeyTableProps> = ({ otRows, ztTokens, rowGroups }) => {
  const pairs = useMemo(() => {
    const totalOT = otRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const totalZT = ztTokens.length;
    if (totalOT === 0) return [] as Pair[];
    const cursor = { i: 0 };
    const out: Pair[] = [];
    if (rowGroups && rowGroups.length) {
      for (let r = 0; r < otRows.length; r++) {
        const otRow = otRows[r].filter(c => c.ch !== '');
        const sizes = (rowGroups[r] || []).slice(0, otRow.length);
        while (sizes.length < otRow.length) sizes.push(0);
        for (let c = 0; c < otRow.length; c++) {
          const take = Math.max(0, Math.min(totalZT - cursor.i, sizes[c]));
          const group = ztTokens.slice(cursor.i, cursor.i + take);
          cursor.i += take;
          if (!otRow[c]) continue;
          const zt = group.map(z => z.text).join('');
          out.push({ ot: otRow[c].ch, zt });
        }
      }
    } else {
      const ratio = totalZT / totalOT;
      const rowInfos = otRows.map(r => ({ otCount: r.filter(c => c.ch !== '').length, frac: 0, alloc: 0 }));
      let allocated = 0;
      for (const info of rowInfos) {
        const exact = info.otCount * ratio;
        const base = Math.floor(exact);
        info.alloc = base;
        info.frac = exact - base;
        allocated += base;
      }
      let remaining = totalZT - allocated;
      if (remaining > 0) {
        const order = rowInfos.map((info, idx) => ({ idx, frac: info.frac })).sort((a, b) => b.frac - a.frac);
        let j = 0;
        while (remaining > 0 && order.length > 0) {
          rowInfos[order[j].idx].alloc += 1;
          remaining--;
          j = (j + 1) % order.length;
        }
      }
      for (let r = 0; r < otRows.length; r++) {
        const otRow = otRows[r];
        const countForRow = Math.max(0, Math.min(totalZT - cursor.i, rowInfos[r].alloc));
        const cols = distributeRow(otRow, countForRow, ztTokens, cursor);
        for (const col of cols) {
          if (!col.ot) continue;
          const zt = col.zt.map(z => z.text).join('');
          out.push({ ot: col.ot.ch, zt });
        }
      }
    }
    return out;
  }, [otRows, ztTokens, rowGroups]);

  // Aggregate by OT character: each OT appears once with unique ZT tokens combined
  const aggregated = useMemo(() => {
    const map = new Map<string, { list: string[]; set: Set<string> }>();
    const order: string[] = [];
    for (const p of pairs) {
      if (!map.has(p.ot)) {
        map.set(p.ot, { list: [], set: new Set() });
        order.push(p.ot);
      }
      const entry = map.get(p.ot)!;
      const group = p.zt; // already concatenated string like '11' or '12'
      if (!entry.set.has(group)) {
        entry.set.add(group);
        entry.list.push(group);
      }
    }
    return order.map(ot => ({ ot, ztList: map.get(ot)!.list }));
  }, [pairs]);

  if (aggregated.length === 0) return <div className="text-sm text-gray-500">(žiadne páry)</div>;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">OT</th>
            <th className="text-left px-3 py-2">ZT</th>
          </tr>
        </thead>
        <tbody>
          {aggregated.map((row) => (
            <tr key={row.ot} className="border-t border-gray-100">
              <td className="px-3 py-2 font-mono">{row.ot}</td>
              <td className="px-3 py-2 font-mono">{row.ztList.join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default KeyTable;
