import React, { useMemo } from 'react';
import type { Column, MappingTableProps } from '../types';
import OTCell from './OTCell';

// (Removed distributeRow; fallback distribution now linear 1:1.)

/**
 * MappingTable renders the OT grid and distributes ZT tokens into cells.
 *
 * Responsibilities:
 * - Given OT layout (rows of characters) and ZT tokens, it groups tokens into columns per OT cell.
 * - Optionally respects an explicit allocation matrix (rowGroups) for exact counts per cell.
 */
const MappingTable: React.FC<MappingTableProps> = ({ otRows, ztTokens, rowGroups, onLockOT, onUnlockOT, lockedKeys, hasDeceptionWarning, onEditToken, selections }) => {
  // Divide ZT tokens into rows and columns based on OT structure and rowGroups
  const rows = useMemo(() => {
    const totalOT = otRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const totalZT = ztTokens.length;
    if (totalOT === 0) return [] as Column[][];

    const cursor = { i: 0 };
    const result: Column[][] = [];
    // (expandWithDeception removed - now partitioning uses selections directly)

    if (rowGroups && rowGroups.length) {
      for (let r = 0; r < otRows.length; r++) {
        const otRow = otRows[r].filter(c => c.ch !== '');
        const cellGroups = (rowGroups[r] || []).slice(0, otRow.length);
        while (cellGroups.length < otRow.length) cellGroups.push([]);
        const rowCols: Column[] = [];
        for (let c = 0; c < otRow.length; c++) {
          const indices = cellGroups[c];
          cursor.i += indices.length;
          const ch = otRow[c].ch;
          const chosen = (lockedKeys && lockedKeys[ch]) || (selections && selections[ch]) || null;
          if (indices.length <= 1 || !chosen) {
            rowCols.push({ ot: otRow[c], zt: indices });
            continue;
          }
          // Rozdeľ podľa vybraného tokenu: všetky tokeny v skupine zostanú v pôvodnom poradí.
          const chosenPositions = indices.filter(i => ztTokens[i]?.text === chosen);
          // Ak vybraný token sa vyskytuje viackrát, vezmi prvý výskyt.
          const chosenIndex = chosenPositions.length ? chosenPositions[0] : indices[0];
          const before = indices.filter(i => i < chosenIndex);
          const after = indices.filter(i => i > chosenIndex);
          // Deception bunky pred
          for (const bi of before) rowCols.push({ ot: null, zt: [bi], deception: true });
          // Hlavná bunka s vybraným tokenom
          rowCols.push({ ot: otRow[c], zt: [chosenIndex] });
          // Deception bunky po
          for (const ai of after) rowCols.push({ ot: null, zt: [ai], deception: true });
        }
        result.push(rowCols);
      }
      return result;
    }
    // Fallback: strictly lineárne 1 token na 1 OT bunku v poradí, zvyšné tokeny ako deception bunky na konci.
    const flatIndices: number[] = Array.from({ length: Math.min(totalOT, totalZT) }, (_, i) => i);
    let k = 0;
    for (let r = 0; r < otRows.length; r++) {
      const otRowFull = otRows[r];
      const otFiltered = otRowFull.filter(c => c.ch !== '');
      const cols: Column[] = [];
      for (let c = 0; c < otFiltered.length; c++) {
        if (k < flatIndices.length) {
          const idx = flatIndices[k];
          const ch = otFiltered[c].ch;
          const chosen = (lockedKeys && lockedKeys[ch]) || (selections && selections[ch]) || null;
          // Ak je vybrané niečo iné ako aktuálny token, vlož deception pred.
          if (chosen && ztTokens[idx]?.text !== chosen) {
            // nájdi prvý výskyt chosen v zvyšných tokenoch
            let found = -1;
            for (let look = k; look < flatIndices.length; look++) {
              const testIdx = flatIndices[look];
              if (ztTokens[testIdx]?.text === chosen) { found = testIdx; break; }
            }
            if (found >= 0 && found !== idx) {
              // deception aktuálny idx
              cols.push({ ot: null, zt: [idx], deception: true });
              // hlavná bunka posunie chosen token (bez vynechania poradia pre ďalšie ot)
              cols.push({ ot: otFiltered[c], zt: [found] });
              k++;
              continue;
            }
          }
          cols.push({ ot: otFiltered[c], zt: [idx] });
          k++;
        } else {
          cols.push({ ot: otFiltered[c], zt: [] });
        }
      }
      result.push(cols);
    }
    // Leftover tokens => append to posledný riadok ako deception bunky (po OT bunkách)
    if (totalZT > flatIndices.length) {
      const leftovers: number[] = [];
      for (let i = flatIndices.length; i < totalZT; i++) leftovers.push(i);
      if (result.length === 0) result.push([]);
      const lastRow = result[result.length - 1];
      for (const li of leftovers) lastRow.push({ ot: null, zt: [li], deception: true });
    }
    return result;
  }, [otRows, ztTokens, rowGroups, lockedKeys, selections]);



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
                  deception={Boolean(col.deception || col.ot == null)}
                  onEditToken={onEditToken}
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
