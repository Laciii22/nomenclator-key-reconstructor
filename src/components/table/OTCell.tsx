import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { OTCellProps } from '../types';
import ZTTokenComp from './ZTToken';
import { tokensFromIndices, joinTokenTexts } from '../../utils/tokenHelpers';


/**
 * OTCell renders a single OT grid cell with its assigned ZT tokens.
 *
 * Props:
 * - ot: The OT character metadata (or null for empty placeholders).
 * - tokens: List of ZT tokens currently allocated to this cell.
 * - row/col: Coordinates of the cell in the grid; used to compute DnD target id.
 * - startIndex: Flat index into the ZT token stream for the first token in this cell.
 */
const OTCell: React.FC<OTCellProps> = ({ ot, tokens, tokenIndices, row, col, onLockOT, onUnlockOT, lockedValue, onEditToken, deception, isFixedLength, groupSize = 1, flatIndex, onInsertAfterGroup, onSplitGroup, allowExpandFromStart }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${row}-${col}`, data: { row, col, isKlamac: !ot, flatIndex } });

  // Map token indices to token objects and filter undefined
  // In fixed-length mode we may want to display up to `groupSize` constituent single-char tokens
  let displayedIndices: number[] = [];
  if (Array.isArray(tokenIndices) && tokenIndices.length > 0) {
    // Only expand to `groupSize` when this is a real OT cell (not a deception placeholder)
    const isRealOtCell = !!ot;
    if (isRealOtCell && isFixedLength && groupSize > 1) {
      // If the column already contains a full group, respect those indices.
      // Otherwise, only expand from the single start index when allowed
      // (MappingTable computes `allowExpandFromStart` to avoid overlap).
      if (tokenIndices.length >= groupSize) {
        displayedIndices = tokenIndices.slice(0, groupSize);
      } else if (tokenIndices.length === 1 && allowExpandFromStart) {
        const start = tokenIndices[0];
        for (let k = 0; k < groupSize; k++) {
          const idx = start + k;
          if (idx < tokens.length) displayedIndices.push(idx);
        }
      } else {
        // fallback: show actual assigned indices only
        displayedIndices = tokenIndices.slice();
      }
    } else {
      // For deception cells or non-fixed mode, show only the actual indices assigned
      displayedIndices = tokenIndices.slice();
    }
  }

  const filtered = displayedIndices.length
    ? tokensFromIndices(tokens, displayedIndices).map((t, i) => ({ t, idx: displayedIndices[i] }))
    : [];

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: ot ? `ot-${row}-${col}` : `ot-empty-${row}-${col}`,
    data: { type: 'ot', flatIndex, sourceRow: row, sourceCol: col },
    disabled: !ot || Boolean(lockedValue),
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative border rounded p-1 shadow-sm transition-colors ${deception ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-200'} ${isOver ? 'bg-blue-50 border-blue-300' : ''}`}
    >
      <div className="text-center font-mono text-base mb-1">
        {ot ? (
          <span
            ref={setDragRef}
            {...attributes}
            {...(!lockedValue ? listeners : {})}
            className={` ${lockedValue ? 'bg-green-200 text-neutral-950' : ''} inline-block px-1 rounded bg-green-100 text-green-800 border border-green-300 font-mono text-md font-bold cursor-pointer select-none`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              // Double-click toggles lock to avoid conflict with drag
              if (lockedValue) {
                if (onUnlockOT) onUnlockOT(ot.ch);
                return;
              }
              if (!onLockOT) return;
              const groupStr = joinTokenTexts(filtered.map(f => f.t));
              if (groupStr) onLockOT(ot.ch, groupStr);
            }}
            title={lockedValue ? `OT: ${ot.ch} — double-click to unlock (${lockedValue})` : `OT: ${ot.ch} — double-click to lock to this cell's ZT group`}
          >
            {ot.ch}
          </span>
        ) : (
          <span className="inline-block px-1 rounded bg-orange-100 text-orange-800 border border-orange-300 font-mono text-md" title="Pravdepodobný klamač">!</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {filtered.length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          filtered.map(({ t, idx }, i) => (
            <ZTTokenComp
              key={`${t.id}-${i}`}
              token={t}
              tokenIndex={idx}
              row={row}
              col={col}
              onEdit={onEditToken}
              // A multi-char lock locks all constituent single-char tokens
              isLocked={Boolean(lockedValue && lockedValue === filtered.map(x => x.t.text).join(''))}
            />
          ))
        )}
      </div>
      {isFixedLength && ot && !lockedValue && typeof flatIndex === 'number' && flatIndex >= 0 && (
        <button
          className="absolute top-1 right-1 px-1 py-0.5 text-xs rounded bg-purple-100 hover:bg-purple-200 leading-none"
          onClick={() => onInsertAfterGroup && onInsertAfterGroup(flatIndex!)}
          title="Pridať raw znaky za túto skupinu"
        >+</button>
      )}
      {ot && ot.ch.length > 1 && typeof flatIndex === 'number' && flatIndex >= 0 && (
        <button
          className="absolute top-1 left-1 px-1 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 leading-none"
          onClick={() => {
            if (lockedValue) return; // avoid splitting when locked
            if (onSplitGroup) onSplitGroup(flatIndex!);
          }}
          title={lockedValue ? 'Najprv odomkni, potom rozdeľ skupinu' : 'Rozdeliť skupinu na jednotlivé znaky'}
        >-</button>
      )}
    </div>
  );
};

export default OTCell;
