/**
 * OTCell: A single grid cell representing an OT character and its allocated ZT tokens.
 * 
 * Features:
 * - Displays ZT tokens allocated to this OT character
 * - Drag-and-drop support for merging adjacent OT cells
 * - Lock/unlock controls for fixing OT→ZT mappings
 * - Fixed-length mode: shift controls and group expansion
 * - Visual feedback for errors (empty, duplicate, highlighted)
 */

import React from 'react';
import { useDndContext, useDroppable, useDraggable } from '@dnd-kit/core';
import type { OTCellProps } from '../types';
import ZTTokenComp from './ZTToken';
import { tokensFromIndices, joinTokenTexts } from '../../utils/tokenHelpers';
import padlock from '../../assets/icons/padlock.png';
import plusIcon from '../../assets/icons/plus.png';
import minus from '../../assets/icons/minus.png';
import leftIcon from '../../assets/icons/left-arrow.png';
import rightIcon from '../../assets/icons/right-arrow.png';

interface OtDragData {
  type: 'ot';
  otChar?: string;
  flatIndex?: number;
  sourceRow?: number;
  sourceCol?: number;
}

interface ZtDragData {
  type: 'zt';
  token?: unknown;
  tokenIndex?: number;
}

type DragData = OtDragData | ZtDragData | Record<string, unknown>;

/**
 * A single OT grid cell with its allocated ZT tokens.
 * Supports drag-and-drop, locking, and visual error states.
 */
const OTCell: React.FC<OTCellProps> = ({ 
  ot, 
  tokens, 
  tokenIndices, 
  row, 
  col, 
  onLockOT, 
  onUnlockOT, 
  lockedValue, 
  onEditToken, 
  deception, 
  isFixedLength, 
  groupSize = 1, 
  flatIndex, 
  onInsertAfterGroup, 
  onSplitGroup, 
  allowExpandFromStart, 
  highlightedOTChar, 
  hasDuplicateKey, 
  onShiftLeft, 
  onShiftRight, 
  canShiftLeft, 
  canShiftRight 
}) => {
  const { active } = useDndContext();
  const activeDragData = (active?.data?.current ?? {}) as DragData;
  const activeDragType = 'type' in activeDragData ? activeDragData.type : undefined;
  const isDraggingOT = activeDragType === 'ot';

  const { setNodeRef, isOver } = useDroppable({ 
    id: `cell-${row}-${col}`, 
    data: { row, col, isKlamac: !ot, flatIndex } 
  });

  // In fixed-length mode we may want to display up to `groupSize` constituent single-char tokens
  const computeDisplayedTokenIndices = (): number[] => {
    if (!Array.isArray(tokenIndices) || tokenIndices.length === 0) return [];

    const isRealOtCell = !!ot;
    const shouldExpandGroup = isRealOtCell && isFixedLength && groupSize > 1;

    if (!shouldExpandGroup) {
      return tokenIndices.slice();
    }

    // Expand to full group size if allowed
    if (tokenIndices.length >= groupSize) {
      return tokenIndices.slice(0, groupSize);
    }

    if (tokenIndices.length === 1 && allowExpandFromStart) {
      const startIndex = tokenIndices[0];
      const expandedIndices: number[] = [];
      for (let offset = 0; offset < groupSize; offset++) {
        const idx = startIndex + offset;
        if (idx < tokens.length) expandedIndices.push(idx);
      }
      return expandedIndices;
    }

    return tokenIndices.slice();
  };

  const displayedIndices = computeDisplayedTokenIndices();
  const displayedTokens = displayedIndices.length
    ? tokensFromIndices(tokens, displayedIndices).map((token, i) => ({ 
        token, 
        tokenIndex: displayedIndices[i] 
      }))
    : [];

  const isEmptyRealOtCell = Boolean(ot) && !deception && displayedTokens.length === 0;
  const isDuplicateKey = Boolean(ot) && !deception && Boolean(hasDuplicateKey);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: ot ? `ot-${row}-${col}` : `ot-empty-${row}-${col}`,
    data: { type: 'ot', otChar: ot?.ch, flatIndex, sourceRow: row, sourceCol: col },
    disabled: !ot || Boolean(lockedValue),
  });

  // Visual-only drop affordance for OT merging (real enforcement in resolveMergeFromEvent + joinOTAt)
  const sourceRow = activeDragType === 'ot' && 'sourceRow' in activeDragData ? activeDragData.sourceRow : undefined;
  const sourceCol = activeDragType === 'ot' && 'sourceCol' in activeDragData ? activeDragData.sourceCol : undefined;
  const isAdjacentRightCell = typeof sourceRow === 'number' 
    && typeof sourceCol === 'number' 
    && sourceRow === row 
    && sourceCol + 1 === col;

  const canAcceptOtMergeDrop = Boolean(
    isDraggingOT
    && ot
    && !deception
    && !lockedValue
    && isAdjacentRightCell
  );

  const isValidDropTarget = isDraggingOT && ot && !deception;
  const isInvalidOtHover = isOver && isDraggingOT && !canAcceptOtMergeDrop;
  const isValidOtHover = isOver && isDraggingOT && canAcceptOtMergeDrop;

  const hasError = deception || isEmptyRealOtCell || isDuplicateKey;
  const isHighlighted = Boolean(ot && highlightedOTChar === ot.ch);
  const canShowFixedLengthActions = Boolean(
    isFixedLength 
    && !lockedValue 
    && typeof flatIndex === 'number' 
    && flatIndex >= 0
  );

  // Handle lock/unlock toggle
  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onLockOT || !ot) return;
    
    if (lockedValue) {
      onUnlockOT?.(ot.ch);
      return;
    }
    
    if (isEmptyRealOtCell) return;
    
    const groupText = joinTokenTexts(displayedTokens.map(f => f.token));
    if (groupText) onLockOT(ot.ch, groupText);
  };

  // Handle edit or insert in separator mode
  const handleEditOrInsert = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (displayedTokens.length === 0) {
      if (typeof flatIndex === 'number' && flatIndex >= 0) {
        onInsertAfterGroup?.(flatIndex);
      }
      return;
    }
    
    if (!onEditToken) return;
    
    const currentGroupText = displayedTokens.map(f => f.token.text).join('');
    const userInput = window.prompt('Edit token for this OT (no spaces):', currentGroupText);
    
    if (userInput?.trim()) {
      onEditToken(displayedTokens[0].tokenIndex, userInput.trim());
    }
  };

  // Helper to render shift buttons for fixed-length mode
  const renderShiftButton = (
    direction: 'left' | 'right', 
    canShift: boolean | undefined, 
    onShift: ((flatIdx: number) => void) | undefined
  ) => {
    if (!canShowFixedLengthActions) return null;

    const icon = direction === 'left' ? leftIcon : rightIcon;
    const title = canShift ? `Shift one character to the ${direction}` : undefined;

    return (
      <button
        type="button"
        className={`px-1 py-0.5 text-xs rounded border ${
          canShift 
            ? 'border-gray-300 hover:bg-gray-100 hover:border-gray-400' 
            : 'border-transparent opacity-30 cursor-not-allowed'
        }`}
        onClick={e => {
          e.stopPropagation();
          if (!canShift || !onShift) return;
          onShift(flatIndex!);
        }}
        disabled={!canShift}
        title={title}
      >
        <img src={icon} alt={direction} className="w-2 h-2" />
      </button>
    );
  };

  // Helper to get OT label className
  const getOtLabelClassName = (
    locked: string | string[] | null | undefined, 
    dragging: boolean, 
    highlighted: boolean
  ) => {
    const baseClasses = 'inline-block px-1 rounded font-mono text-sm font-bold select-none';
    
    const isLocked = locked && (typeof locked === 'string' || locked.length > 0);
    
    let stateClasses: string;
    if (isLocked) {
      stateClasses = 'cursor-default bg-green-200 text-neutral-950 border-green-300';
    } else if (dragging) {
      stateClasses = 'cursor-grabbing opacity-60 bg-yellow-100 text-yellow-800 border-yellow-300';
    } else {
      stateClasses = 'cursor-grab bg-yellow-100 text-yellow-800 border-yellow-300';
    }

    const highlightClasses = highlighted ? 'ring-2 ring-purple-400' : '';

    return `${baseClasses} ${stateClasses} ${highlightClasses}`;
  };

  const cellBaseClasses = 'relative border rounded p-0.5 shadow-sm transition-colors';
  const cellColorClasses = hasError 
    ? 'bg-red-50 border-red-300' 
    : 'bg-white border-gray-200';
  const cellDropHintClasses = isValidDropTarget && canAcceptOtMergeDrop 
    ? 'ring-1 ring-green-200' 
    : '';
  const cellHoverClasses = isValidOtHover 
    ? 'bg-green-50 border-green-300 ring-2 ring-green-300' 
    : isInvalidOtHover 
      ? 'bg-red-50 border-red-300 ring-2 ring-red-300' 
      : '';
  const cellDragClasses = isDragging ? 'opacity-70' : '';
  const cellHighlightClasses = isHighlighted ? 'ring-2 ring-purple-400 bg-purple-50' : '';

  const cellClassName = `${cellBaseClasses} ${cellColorClasses} ${cellDropHintClasses} ${cellHoverClasses} ${cellDragClasses} ${cellHighlightClasses}`;

  return (
    <div ref={setNodeRef} className={cellClassName}>
      {/* Render OT label with optional left/right shift buttons */}
      <div className="text-center font-mono text-sm mb-0.5 flex items-center justify-center gap-1">
        {renderShiftButton('left', canShiftLeft, onShiftLeft)}
        {ot ? (
          <span
            ref={setDragRef}
            {...attributes}
            {...(!lockedValue ? listeners : {})}
            className={getOtLabelClassName(lockedValue, isDragging, isHighlighted)}
            title={lockedValue ? `OT: ${ot.ch} — locked (${Array.isArray(lockedValue) ? lockedValue.join(', ') : lockedValue})` : `OT: ${ot.ch}`}
          >
            {ot.ch}
          </span>
        ) : (
          <span 
            className="inline-block px-1 rounded bg-red-100 text-red-800 border border-red-300 font-mono text-sm" 
            title="Probable deception token"
          >
            !
          </span>
        )}
        {renderShiftButton('right', canShiftRight, onShiftRight)}
      </div>
      {/* Render assigned ZT tokens or empty state */}
      <div className="flex flex-wrap gap-1 justify-center">
        {displayedTokens.length === 0 ? (
          <span className={isEmptyRealOtCell ? 'text-red-500 text-sm' : 'text-gray-300 text-sm'}>—</span>
        ) : (
          displayedTokens.map(({ token, tokenIndex }, i) => {
            const currentGroupText = displayedTokens.map(x => x.token.text).join('');
            const isTokenLocked = Boolean(lockedValue && lockedValue === currentGroupText);

            return (
              <ZTTokenComp
                key={`${token.id}-${i}`}
                token={token}
                tokenIndex={tokenIndex}
                row={row}
                col={col}
                onEdit={onEditToken}
                isLocked={isTokenLocked}
              />
            );
          })
        )}
      </div>
      {canShowFixedLengthActions && (
        <button
          className="absolute top-1 right-1 px-1 py-0.5 text-xs rounded bg-purple-100 hover:bg-purple-200 leading-none"
          onClick={() => onInsertAfterGroup?.(flatIndex!)}
          title="Add raw ZT token to this group"
        >
          <img src={plusIcon} alt="edit ZT token" className="w-2 h-2" />
        </button>
      )}
      {/* In separator mode show a + to edit the token, or insert when empty */}
      {!isFixedLength && ot && !lockedValue && (
        <button
          className="absolute top-1 right-1 px-1 py-0.5 text-xs rounded bg-purple-100 hover:bg-purple-200 leading-none"
          onClick={handleEditOrInsert}
          title={displayedTokens.length === 0 ? 'Insert ZT token for this OT' : 'Edit raw ZT token for this OT'}
        >
          <img src={plusIcon} alt="edit ZT token" className="w-2 h-2" />
        </button>
      )}
      {ot && (
        <button
          className="absolute bottom-1 left-1 px-1 py-0.5 text-xs rounded bg-transparent hover:bg-gray-100 leading-none"
          onClick={handleLockToggle}
          disabled={!lockedValue && isEmptyRealOtCell}
          title={lockedValue ? `Unlock ${ot.ch}` : (isEmptyRealOtCell ? 'Cannot lock an empty cell' : `Lock ${ot.ch}`)}
          aria-label={lockedValue ? `Unlock ${ot.ch}` : `Lock ${ot.ch}`}
          aria-pressed={!!lockedValue}
        >
          <img 
            src={padlock} 
            alt="lock" 
            aria-hidden="true" 
            className={`w-2 h-2 ${lockedValue ? 'opacity-100' : 'opacity-80'}`} 
          />
        </button>
      )}

      {ot && ot.ch.length > 1 && typeof flatIndex === 'number' && flatIndex >= 0 && (
        <button
          className="absolute top-1 left-2 px-1 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 leading-none"
          onClick={(e) => {
            e.stopPropagation();
            if (lockedValue) return;
            onSplitGroup?.(flatIndex!);
          }}
          title={lockedValue ? 'First unlock, then split the group' : 'Split group into individual characters'}
        >
        <img
          src = {minus}
          className="h-2 w-2"
        />

        </button>
      )}
    </div>
  );
};

export default OTCell;
