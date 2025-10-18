import React, { useMemo } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { Column, MappingTableProps, OTChar, ZTToken } from '../types';
import OTCell from './OTCell';


function distributeRow(otRow: OTChar[], ztRowCount: number, takeFrom: ZTToken[], cursor: { i: number }): Column[] {
  const otCells = otRow.filter(c => c.ch !== '');
  const oc = otCells.length;
  if (oc === 0) {
    // nothing to distribute to
    return [];
  }
  //number of tokens divided by number of OT cells
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

const MappingTable: React.FC<MappingTableProps> = ({ otRows, ztTokens, rowGroups, onMoveZTToken }) => {
  // Divide ZT tokens into rows and columns based on OT structure and rowGroups
  const rows = useMemo(() => {
    const totalOT = otRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const totalZT = ztTokens.length;
    console.log('MappingTable recalculating rows with rowGroups:', rowGroups);
    if (totalOT === 0) return [] as Column[][];

    const cursor = { i: 0 };
    const result: Column[][] = [];
    if (rowGroups && rowGroups.length) {
      console.log('Using custom rowGroups:', rowGroups);
      for (let r = 0; r < otRows.length; r++) {
        const otRow = otRows[r].filter(c => c.ch !== '');
        const sizes = (rowGroups[r] || []).slice(0, otRow.length);
        while (sizes.length < otRow.length) sizes.push(0);
        console.log(`Row ${r}: sizes =`, sizes);
        const cols: Column[] = [];
        for (let c = 0; c < otRow.length; c++) {
          const take = Math.max(0, Math.min(totalZT - cursor.i, sizes[c]));
          const group = ztTokens.slice(cursor.i, cursor.i + take);
          cursor.i += take;
          cols.push({ ot: otRow[c], zt: group });
        }
        result.push(cols);
      }
      console.log('Final distribution result:', result);
      return result;
    }

    // fallback: proportional distribution if rowGroups are not provided
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
      while (remaining > 0 && j < order.length) {
        rowInfos[order[j].idx].alloc += 1;
        remaining--;
        j = (j + 1) % order.length;
      }
    }
    for (let r = 0; r < otRows.length; r++) {
      const otRow = otRows[r];
      const countForRow = Math.max(0, Math.min(totalZT - cursor.i, rowInfos[r].alloc));
      const cols = distributeRow(otRow, countForRow, ztTokens, cursor);
      result.push(cols);
    }
    return result;
  }, [otRows, ztTokens, rowGroups]);

  function parseCellId(id?: string | number | null): { row: number; col: number } | null {
    if (!id) return null;
    const m = String(id).match(/^cell-(\d+)-(\d+)$/);
    if (!m) return null;
    return { row: Number(m[1]), col: Number(m[2]) };
  }

  // precompute cell starting indices to avoid O(n^2) when rendering tokens
  const cellStarts: number[][] = useMemo(() => {
    const starts: number[][] = [];
    let idx = 0;
    for (let r = 0; r < rows.length; r++) {
      starts[r] = [];
      for (let c = 0; c < rows[r].length; c++) {
        starts[r][c] = idx;
        idx += rows[r][c].zt.length;
      }
    }
    return starts;
  }, [rows]);

  function onDragEnd(evt: DragEndEvent) {
    const dragData = evt.active.data.current as { type: 'zt'; token?: ZTToken; tokenIndex?: number; row: number; col: number } | undefined;
    const dropData = parseCellId(evt.over?.id ?? null);
    
    
    if (!dragData || !dropData) {
      return;
    }
    
    if (dragData.type === 'zt' && onMoveZTToken && dragData.tokenIndex !== undefined) {
      onMoveZTToken(dragData.tokenIndex, dropData.row, dropData.col);
    }
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="space-y-4">
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
                    tokens={col.zt}
                    row={rIdx}
                    col={cIdx}
                    startIndex={cellStarts[rIdx]?.[cIdx] ?? 0}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </DndContext>
  );
};

export default MappingTable;
