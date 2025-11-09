import React, { useMemo } from 'react';
import type { Column, MappingTableProps, OTChar } from '../types';
import OTCell from './OTCell';

function distributeRow(otRow: OTChar[], ztRowIndices: number[], cursor: { i: number }): Column[] {
  const otCells = otRow.filter(c => c.ch !== '');
  const oc = otCells.length;
  if (oc === 0) {
    return [];
  }
  // number of tokens divided by number of OT cells
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
 * MappingTable renders the OT grid and distributes ZT tokens into cells.
 *
 * Responsibilities:
 * - Given OT layout (rows of characters) and ZT tokens, it groups tokens into columns per OT cell.
 * - Optionally respects an explicit allocation matrix (rowGroups) for exact counts per cell.
 */
const MappingTable: React.FC<MappingTableProps> = ({ otRows, ztTokens, rowGroups, onLockOT, onUnlockOT, lockedKeys, hasDeceptionWarning }) => {
  // Divide ZT tokens into rows and columns based on OT structure and rowGroups
  const rows = useMemo(() => {
    const totalOT = otRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const totalZT = ztTokens.length;
    if (totalOT === 0) return [] as Column[][];

    const cursor = { i: 0 };
    const result: Column[][] = [];
  if (rowGroups && rowGroups.length) {
      for (let r = 0; r < otRows.length; r++) {
        const otRow = otRows[r].filter(c => c.ch !== '');
        const sizes = (rowGroups[r] || []).slice(0, otRow.length);
        while (sizes.length < otRow.length) sizes.push([]);
        const cols: Column[] = [];
        for (let c = 0; c < otRow.length; c++) {
          const group = sizes[c];
          cursor.i += group.length;
          cols.push({ ot: otRow[c], zt: group });
        }
        result.push(cols);
      }
      return result;
    }

    // fallback: proportional distribution if rowGroups are not provided
    const ratio = Math.min(1, totalZT / totalOT);
    const rowInfos = otRows.map(r => ({ otCount: r.filter(c => c.ch !== '').length, frac: 0, alloc: 0 }));
    let allocated = 0;
    for (const info of rowInfos) {
      const exact = info.otCount * ratio;
      const base = Math.floor(exact);
      info.alloc = base;
      info.frac = exact - base;
      allocated += base;
    }
    allocated = Math.min(allocated, totalOT);
    let remaining = totalZT - allocated;
    if (remaining > 0) {
      const order = rowInfos.map((info, idx) => ({ idx, frac: info.frac })).sort((a, b) => b.frac - a.frac);
      let j = 0;
      while (remaining > 0 && allocated < totalOT && j < order.length) {
        rowInfos[order[j].idx].alloc += 1;
        allocated += 1;
        remaining -= 1;
        j = (j + 1) % order.length;
      }
    }
    const takeFrom = Array.from({length: totalZT}, (_, i) => i);
    for (let r = 0; r < otRows.length; r++) {
      const otRow = otRows[r];
      const countForRow = Math.max(0, Math.min(totalZT - cursor.i, rowInfos[r].alloc));
      const ztRowIndices = takeFrom.slice(cursor.i, cursor.i + countForRow);
      const cols = distributeRow(otRow, ztRowIndices, {i: 0});
      result.push(cols);
      cursor.i += countForRow;
    }
    return result;
  }, [otRows, ztTokens, rowGroups]);

  // Note: DnD drop handling moved to top-level page; cells remain droppable for styling if needed.


  return (
    <div className={`space-y-4 ${hasDeceptionWarning ? 'border border-orange-300 rounded p-2 bg-orange-50' : ''}`}>
      {rows.map((cols, rIdx) => (
        <div key={rIdx} className="mb-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` }}>
            {cols.length === 0 ? (
              <div className="text-gray-400 text-sm">(prázdny riadok)</div>
            ) : (
              cols.map((col, cIdx) => (
                <OTCell
                  key={cIdx}
                  ot={col.ot ?? null}
                  tokens={col.zt.map(i => ztTokens[i])}
                  tokenIndices={col.zt}
                  row={rIdx}
                  col={cIdx}
                  onLockOT={onLockOT}
                  onUnlockOT={onUnlockOT}
                  lockedValue={col.ot ? lockedKeys?.[col.ot.ch] : undefined}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MappingTable;
