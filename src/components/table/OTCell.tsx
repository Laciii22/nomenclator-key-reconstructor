import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { OTCellProps } from '../types';
import ZTTokenComp from './ZTToken';


/**
 * OTCell renders a single OT grid cell with its assigned ZT tokens.
 *
 * Props:
 * - ot: The OT character metadata (or null for empty placeholders).
 * - tokens: List of ZT tokens currently allocated to this cell.
 * - row/col: Coordinates of the cell in the grid; used to compute DnD target id.
 * - startIndex: Flat index into the ZT token stream for the first token in this cell.
 */
const OTCell: React.FC<OTCellProps> = ({ ot, tokens, tokenIndices, row, col, onLockOT, onUnlockOT, lockedValue, onEditToken, deception }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${row}-${col}` });

  // Filter out undefined tokens and indices to avoid runtime errors
  const filtered = tokens
    .map((t, i) => ({ t, idx: tokenIndices[i] }))
    .filter(({ t }) => t !== undefined && t !== null);

  return (
    <div
      ref={setNodeRef}
      className={`border rounded p-1 shadow-sm transition-colors ${deception ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-200'} ${isOver ? 'bg-blue-50 border-blue-300' : ''}`}
    >
      <div className="text-center font-mono text-base mb-1">
        {ot ? (
          <span
            className={` ${lockedValue ? 'bg-green-200 text-neutral-950' : ''} inline-block px-1 rounded bg-green-100 text-green-800 border border-green-300 font-mono text-md font-bold cursor-pointer select-none`}
            onClick={() => {
              // If currently locked, clicking unlocks; otherwise it locks to this cell's ZT group
              if (lockedValue) {
                if (onUnlockOT) onUnlockOT(ot.ch);
                return;
              }
              if (!onLockOT) return;
              const groupStr = filtered.map(({ t }) => t.text).join('');
              if (groupStr) onLockOT(ot.ch, groupStr);
            }}
            title={lockedValue ? `OT: ${ot.ch} — click to unlock (${lockedValue})` : `OT: ${ot.ch} — click to lock to this cell's ZT group`}
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
            <ZTTokenComp key={`${t.id}-${i}`} token={t} tokenIndex={idx} row={row} col={col} onEdit={onEditToken} />
          ))
        )}
      </div>
    </div>
  );
};

export default OTCell;
