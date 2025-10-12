import React, { useMemo } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';

export type OTChar = { id: string; ch: string };
export type ZTToken = { id: string; text: string; locked?: boolean };

export type MappingTableProps = {
  otRows: OTChar[][];       // riadky OT podľa zvolenej dĺžky
  ztTokens: ZTToken[];      // všetky ZT tokeny (flat)
  rowGroups?: number[][];   // voliteľne počty ZT tokenov na každú OT bunku [riadok][stĺpec]
  onMoveZTToken?: (tokenIndex: number, toRow: number, toCol: number) => void;
};

type Column = { ot: OTChar | null; zt: ZTToken[] };

function distributeRow(otRow: OTChar[], ztRowCount: number, takeFrom: ZTToken[], cursor: { i: number }): Column[] {
  const otCells = otRow.filter(c => c.ch !== '');
  const oc = otCells.length;
  if (oc === 0) {
    // nič na priradenie – preskoč alebo zobraz prázdno
    return [];
  }
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
  // Rozdeľ ZT tokeny podľa rowGroups, ak sú dané; inak použijeme proporčné rozdelenie
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
          console.log(`  Col ${c} (${otRow[c]?.ch}): take=${take}, tokens=[${group.map(t => t.text).join(',')}]`);
          cursor.i += take;
          cols.push({ ot: otRow[c], zt: group });
        }
        result.push(cols);
      }
      console.log('Final distribution result:', result);
      return result;
    }

    // fallback: proporcionálne rozdelenie, ak rowGroups nie sú
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

  function DraggableZTToken({ token, tokenIndex, row, col }: { token: ZTToken; tokenIndex: number; row: number; col: number }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ 
      id: `zt-${token.id}`, 
      data: { type: 'zt', token, tokenIndex, row, col } 
    });
    
    return (
      <span
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 cursor-move select-none font-mono ${isDragging ? 'opacity-50' : ''}`}
        title="Presuň ZT token do inej bunky"
        style={{ touchAction: 'none' }}
      >
        {token.text}
      </span>
    );
  }

  function DroppableCell({ id, children }: { id: string; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
      <div 
        ref={setNodeRef} 
        className={`border border-gray-200 rounded p-3 shadow-sm bg-white transition-colors ${isOver ? 'bg-blue-50 border-blue-300' : ''}`}
      >
        {children}
      </div>
    );
  }

  function onDragEnd(evt: DragEndEvent) {
    console.log('DragEnd event:', evt);
    const dragData = evt.active.data.current as { type: 'zt'; token?: ZTToken; tokenIndex?: number; row: number; col: number } | undefined;
    const dropData = parseCellId(evt.over?.id ?? null);
    
    console.log('Drag data:', dragData);
    console.log('Drop data:', dropData);
    
    if (!dragData || !dropData) {
      console.log('Missing drag or drop data');
      return;
    }
    
    if (dragData.type === 'zt' && onMoveZTToken && dragData.tokenIndex !== undefined) {
      console.log('Moving ZT token');
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
                  <DroppableCell key={cIdx} id={`cell-${rIdx}-${cIdx}`}>
                    <div className="text-center font-mono text-base mb-2">
                      {col.ot ? (
                        <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-800 border border-green-300 font-mono text-lg font-bold">
                          {col.ot.ch}
                        </span>
                      ) : (
                        '·'
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {col.zt.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        col.zt.map((t, i) => {
                          // calculate global token index
                          let globalIndex = 0;
                          for (let r = 0; r < rIdx; r++) {
                            for (const c of rows[r]) {
                              globalIndex += c.zt.length;
                            }
                          }
                          for (let c = 0; c < cIdx; c++) {
                            globalIndex += rows[rIdx][c].zt.length;
                          }
                          globalIndex += i;
                          
                          return (
                            <DraggableZTToken 
                              key={`${t.id}-${i}`} 
                              token={t} 
                              tokenIndex={globalIndex}
                              row={rIdx} 
                              col={cIdx} 
                            />
                          );
                        })
                      )}
                    </div>
                    {/* šípky odstránené – použite drag & drop po jednom tokene */}
                  </DroppableCell>
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
