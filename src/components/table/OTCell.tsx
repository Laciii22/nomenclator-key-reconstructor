import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { OTCellProps } from '../types';
import ZTTokenComp from './ZTToken';
import { tokensFromIndices, joinTokenTexts } from '../../utils/tokenHelpers';
import padlock from '../../assets/icons/padlock.png';


/**
 * OTCell renders a single OT grid cell with its assigned ZT tokens.
 *
 * Props:
 * - ot: The OT character metadata (or null for empty placeholders).
 * - tokens: List of ZT tokens currently allocated to this cell.
 * - row/col: Coordinates of the cell in the grid; used to compute DnD target id.
 * - startIndex: Flat index into the ZT token stream for the first token in this cell.
 */
const OTCell: React.FC<OTCellProps> = ({ ot, tokens, tokenIndices, row, col, onLockOT, onUnlockOT, lockedValue, onEditToken, deception, isFixedLength, groupSize = 1, flatIndex, onInsertAfterGroup, onSplitGroup, allowExpandFromStart, highlightedOTChar, hasDuplicateKey, onShiftLeft, onShiftRight, canShiftLeft, canShiftRight }) => {
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

  const isEmptyRealOtCell = Boolean(ot) && !deception && filtered.length === 0;
  const isDuplicateKey = Boolean(ot) && !deception && Boolean(hasDuplicateKey);

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: ot ? `ot-${row}-${col}` : `ot-empty-${row}-${col}`,
    data: { type: 'ot', flatIndex, sourceRow: row, sourceCol: col },
    disabled: !ot || Boolean(lockedValue),
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative border rounded p-1 shadow-sm transition-colors ${deception ? 'bg-red-50 border-red-300' : (isEmptyRealOtCell || isDuplicateKey) ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'} ${isOver ? 'bg-blue-50 border-blue-300' : ''} ${ot && highlightedOTChar === ot.ch ? 'ring-2 ring-purple-400 bg-purple-50' : ''}`}
    >
      <div className="text-center font-mono text-base mb-1 flex items-center justify-center gap-1">
        {isFixedLength && ot && !lockedValue && typeof flatIndex === 'number' && flatIndex >= 0 && (
          <button
            type="button"
            className={`px-1 py-0.5 text-xs rounded border border-transparent ${canShiftLeft ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-default'}`}
            onClick={e => {
              e.stopPropagation();
              if (!canShiftLeft || !onShiftLeft) return;
              onShiftLeft(flatIndex);
            }}
            disabled={!canShiftLeft}
            title={canShiftLeft ? 'Shift one character to the left' : undefined}
          >
            &lt;
          </button>
        )}
        {ot ? (
          <span
            ref={setDragRef}
            {...attributes}
            {...(!lockedValue ? listeners : {})}
            className={`inline-block px-1 rounded font-mono text-md font-bold cursor-pointer select-none ${lockedValue ? 'bg-green-200 text-neutral-950 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'} ${ot && highlightedOTChar === ot.ch ? 'ring-2 ring-purple-400' : ''}`}
            title={lockedValue ? `OT: ${ot.ch} — locked (${lockedValue})` : `OT: ${ot.ch}`}
          >
            {ot.ch}
          </span>
        ) : (
          <span className="inline-block px-1 rounded bg-red-100 text-red-800 border border-red-300 font-mono text-md" title="Probable deception token">!</span>
        )}
        {isFixedLength && ot && !lockedValue && typeof flatIndex === 'number' && flatIndex >= 0 && (
          <button
            type="button"
            className={`px-1 py-0.5 text-xs rounded border border-transparent ${canShiftRight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-default'}`}
            onClick={e => {
              e.stopPropagation();
              if (!canShiftRight || !onShiftRight) return;
              onShiftRight(flatIndex);
            }}
            disabled={!canShiftRight}
            title={canShiftRight ? 'Shift one character to the right' : undefined}
          >
            &gt;
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {filtered.length === 0 ? (
          <span className={isEmptyRealOtCell ? 'text-red-500' : 'text-gray-300'}>—</span>
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
          title="Add raw ZT token to this group"
        >+</button>
      )}
      {/* In separator mode show a similar + to edit the token for this OT cell */}
      {!isFixedLength && ot && !lockedValue && filtered.length > 0 && (
        <button
          className="absolute top-1 right-1 px-1 py-0.5 text-xs rounded bg-purple-100 hover:bg-purple-200 leading-none"
          onClick={(e) => {
            e.stopPropagation();
            if (!onEditToken) return;
            // Pre-fill with the current group/token text (use first token index)
            const cur = filtered.map(f => f.t.text).join('');
            const input = window.prompt('Edit token for this OT (no spaces):', cur);
            if (input != null && input.trim() !== '') {
              const firstIdx = filtered[0].idx;
              onEditToken(firstIdx, input.trim());
            }
          }}
          title="Edit raw ZT token for this OT"
        >+</button>
      )}
      {ot && (
        <button
          className="absolute bottom-1 left-1 px-1 py-0.5 text-xs rounded bg-transparent hover:bg-gray-100 leading-none"
          onClick={(e) => {
            e.stopPropagation();
            if (!onLockOT) return;
            if (lockedValue) {
              if (onUnlockOT) onUnlockOT(ot.ch);
              return;
            }
            if (isEmptyRealOtCell) return;
            const groupStr = joinTokenTexts(filtered.map(f => f.t));
            if (groupStr) onLockOT(ot.ch, groupStr);
          }}
          disabled={!lockedValue && isEmptyRealOtCell}
          title={lockedValue ? `Unlock ${ot.ch}` : (isEmptyRealOtCell ? 'Cannot lock an empty cell' : `Lock ${ot.ch}`)}
          aria-label={lockedValue ? `Unlock ${ot.ch}` : `Lock ${ot.ch}`}
          aria-pressed={!!lockedValue}
        >
          <img src={padlock} alt="" aria-hidden="true" className={`w-4 h-4 ${lockedValue ? 'opacity-100' : 'opacity-80'}`} />
        </button>
      )}

      {ot && ot.ch.length > 1 && typeof flatIndex === 'number' && flatIndex >= 0 && (
        <button
          className="absolute top-1 left-2 px-1 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 leading-none"
          onClick={(e) => {
            e.stopPropagation();
            if (lockedValue) return; // avoid splitting when locked
            if (onSplitGroup) onSplitGroup(flatIndex!);
          }}
          title={lockedValue ? 'First unlock, then split the group' : 'Split group into individual characters'}
        >-</button>
      )}
    </div>
  );
};

export default OTCell;
