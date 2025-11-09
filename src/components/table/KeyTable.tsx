import React, { useMemo } from 'react';
import type { Column, KeyTableProps, OTChar, Pair } from '../types';



function distributeRow(otRow: OTChar[], ztRowIndices: number[], cursor: { i: number }): Column[] {
  const otCells = otRow.filter(c => c.ch !== '');
  const oc = otCells.length;
  if (oc === 0) return [];
  const base = Math.floor(ztRowIndices.length / oc);
  let rem = ztRowIndices.length % oc;
  const cols: Column[] = [];
  for (let k = 0; k < oc; k++) {
    const groupSize = base + (rem > 0 ? 1 : 0);
    const start = cursor.i;
    const end = start + groupSize;
    const group = ztRowIndices.slice(start, end);
    cursor.i = end;
    if (rem > 0) rem--;
    cols.push({ ot: otCells[k], zt: group });
  }
  return cols;
}

/**
 * KeyTable displays the reconstructed nomenclator key pairs OT → ZT.
 *
 * - Computes pairs by walking the same allocation that MappingTable uses (rowGroups or proportional fallback).
 * - Aggregates by OT character; in 'single' mode it displays only the first key but still detects violations if multiple unique keys exist.
 * - Supports locking (ot -> zt) and highlights violations (multiple keys in 'single' mode, or mismatch with lock).
 */
const KeyTable: React.FC<KeyTableProps> = ({ otRows, ztTokens, rowGroups, keysPerOTMode = 'multiple', lockedKeys, onLockOT, onUnlockOT }) => {
  const pairs = useMemo(() => {
    const totalOT = otRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const totalZT = ztTokens.length;
    if (totalOT === 0) return [] as Pair[];
    const cursor = { i: 0 };
    const out: Pair[] = [];
    if (rowGroups && rowGroups.length > 0) {
      for (let r = 0; r < otRows.length; r++) {
        const otRow = otRows[r].filter(c => c.ch !== '');
        const row = rowGroups[r] || [];
        for (let c = 0; c < otRow.length; c++) {
          const indices = row[c] || [];
          const group = indices.map((i: number) => ztTokens[i]).filter((z): z is typeof ztTokens[number] => z !== undefined && z !== null);
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
        const ztRowIndices = Array.from({length: countForRow}, (_, i) => cursor.i + i);
        cursor.i += countForRow;
        const cols = distributeRow(otRow, ztRowIndices, {i: 0});
        for (const col of cols) {
          if (!col.ot) continue;
          const group = col.zt.map(z => ztTokens[z]).filter((z): z is typeof ztTokens[number] => z !== undefined && z !== null);
          const zt = group.map(z => z.text).join('');
          out.push({ ot: col.ot.ch, zt });
        }
      }
    }
    return out;
  }, [otRows, ztTokens, rowGroups]);

  // Aggregate by OT character: collect ZT groups
  const aggregated = useMemo(() => {
    const map = new Map<string, { allSet: Set<string>; displayList: string[] }>();
    const order: string[] = [];
    for (const p of pairs) {
      if (!map.has(p.ot)) {
        map.set(p.ot, { allSet: new Set(), displayList: [] });
        order.push(p.ot);
      }
      const entry = map.get(p.ot)!;
      const group = p.zt;
      // Track full unique set regardless of mode
      if (!entry.allSet.has(group)) {
        entry.allSet.add(group);
      }
      // Display logic depends on mode
      if (keysPerOTMode === 'single') {
        if (entry.displayList.length === 0) {
          entry.displayList.push(group);
        }
      } else {
        // multiple
        if (!entry.displayList.includes(group)) {
          entry.displayList.push(group);
        }
      }
    }
    return order.map(ot => ({ ot, ztList: map.get(ot)!.displayList, uniqueCount: map.get(ot)!.allSet.size }));
  }, [pairs, keysPerOTMode]);

  if (aggregated.length === 0) return <div className="text-sm text-gray-500">(žiadne páry)</div>;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">OT</th>
            <th className="text-left px-3 py-2">ZT</th>
            <th className="text-left px-3 py-2 w-24">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {aggregated.map((row) => {
            // violation rules for keysPerOTMode='single': more than one unique or lock mismatch
            const uniqueCount = (row as { uniqueCount?: number; ztList: string[] }).uniqueCount ?? row.ztList.length;
            const isViolationSingle = keysPerOTMode === 'single' && uniqueCount > 1;
            const isLocked = !!lockedKeys && typeof lockedKeys[row.ot] === 'string';
            const lockedMismatch = isLocked && row.ztList.length > 0 && lockedKeys![row.ot] !== row.ztList[0];
            const trClass = (isViolationSingle || lockedMismatch) ? 'bg-red-50' : '';
            return (
              <tr key={row.ot} className={`border-t border-gray-100 ${trClass}`}>
                <td className="px-3 py-2 font-mono">{row.ot}</td>
                <td className="px-3 py-2 font-mono">
                  <span>{row.ztList.join(' ') || '—'}</span>
                  {isViolationSingle && <span className="ml-2 text-red-600">(viac kľúčov)</span>}
                  {lockedMismatch && <span className="ml-2 text-red-600">(nesúlad so zámkom)</span>}
                </td>
                <td className="px-3 py-2">
                  {onLockOT || onUnlockOT ? (
                    isLocked ? (
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => onUnlockOT && onUnlockOT(row.ot)}
                        title={`Odomknúť ${row.ot}`}
                      >
                        Odomknúť
                      </button>
                    ) : (
                      <button
                        className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200"
                        onClick={() => onLockOT && row.ztList.length > 0 && onLockOT(row.ot, row.ztList[0])}
                        disabled={row.ztList.length === 0}
                        title={row.ztList.length ? `Zamknúť ${row.ot} = ${row.ztList[0]}` : 'Nie je čo zamknúť'}
                      >
                        Zamknúť
                      </button>
                    )
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default KeyTable;
