/**
 * CTToken: A draggable cipher token component.
 * 
 * Represents a single CT (cipher text) token in the grid.
 * Supports drag-and-drop for manual token reordering.
 * Shows visual state for locked tokens and drag operations.
 */

import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CTTokenProps } from '../types';
import { colors } from '../../utils/colors';

/**
 * A draggable CT token component with lock state and swap affordances.
 */
const CTTokenComp: React.FC<CTTokenProps> = ({ token, tokenIndex, row, col, isLocked, activeDragType, activeCtTokenIndex, isFromNull = false, nullInsertedAfterBaseFlatIndex }) => {
  const isDraggingZT = activeDragType === 'ct';
  const activeTokenIndex = typeof activeCtTokenIndex === 'number' ? activeCtTokenIndex : null;

  // Visual-only drop affordance for swapping tokens.
  // Real enforcement still happens in the drag-end handler.
  // Only adjacent swaps are valid, so keep droppable enabled only for those targets
  // to avoid registering/measuring thousands of droppables during drag.
  const isAdjacentSwapTarget = isDraggingZT && activeTokenIndex != null && Math.abs(activeTokenIndex - tokenIndex) === 1;
  const canAcceptCtSwap = Boolean(isAdjacentSwapTarget && !isLocked);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `ct-${token.id}`,
    data: { type: 'ct', token, tokenIndex, row, col, isFromNull, nullInsertedAfterBaseFlatIndex },
    disabled: Boolean(isLocked),
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `ct-drop-${tokenIndex}`,
    data: { type: 'ct', tokenIndex, row, col },
    disabled: !canAcceptCtSwap,
  });
  const isValidCtHover = isOver && canAcceptCtSwap;
  const isInvalidCtHover = isOver && isDraggingZT && !canAcceptCtSwap;

  return (
    <span
      ref={setDropRef}
      style={{ display: 'inline-block' }}
      className={`${isAdjacentSwapTarget ? 'ring-1 ring-green-200 rounded' : ''} ${isValidCtHover ? 'ring-2 ring-green-300 rounded bg-green-50' : ''} ${isInvalidCtHover ? 'ring-2 ring-red-300 rounded bg-red-50' : ''}`}
    >
      <span ref={setNodeRef} style={{ touchAction: 'none' }}>
        <span
          {...attributes}
          {...listeners}
          className={`inline-block max-w-[7rem] truncate align-middle text-xs px-1 py-0.5 rounded font-mono border select-none ${isLocked ? `cursor-default ${colors.tokenLocked}` : `${isDragging ? 'cursor-grabbing opacity-60' : 'cursor-grab'} ${colors.tokenUnlocked}`} ${isDragging ? 'shadow-sm' : ''}`}
          title={`${token.text}${isLocked ? ' (locked token)' : ' (drag to swap with adjacent token)'}`}
        >
          {token.text}
        </span>
      </span>
    </span>
  );
};

export default React.memo(CTTokenComp);
