/**
 * ZTToken: A draggable cipher token component.
 * 
 * Represents a single ZT (cipher text) token in the grid.
 * Supports drag-and-drop for manual token reordering.
 * Shows visual state for locked tokens and drag operations.
 */

import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ZTTokenProps } from '../types';
import { colors } from '../../utils/colors';

/**
 * A draggable ZT token component with lock state and swap affordances.
 */
const ZTTokenComp: React.FC<ZTTokenProps> = ({ token, tokenIndex, row, col, onEdit: _onEdit, isLocked, activeDragType, activeZtTokenIndex }) => {
  const isDraggingZT = activeDragType === 'zt';
  const activeTokenIndex = typeof activeZtTokenIndex === 'number' ? activeZtTokenIndex : null;

  // Visual-only drop affordance for swapping tokens.
  // Real enforcement still happens in the drag-end handler.
  // Only adjacent swaps are valid, so keep droppable enabled only for those targets
  // to avoid registering/measuring thousands of droppables during drag.
  const isAdjacentSwapTarget = isDraggingZT && activeTokenIndex != null && Math.abs(activeTokenIndex - tokenIndex) === 1;
  const canAcceptZtSwap = Boolean(isAdjacentSwapTarget && !isLocked);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `zt-${token.id}`,
    data: { type: 'zt', token, tokenIndex, row, col },
    disabled: Boolean(isLocked),
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `zt-drop-${tokenIndex}`,
    data: { type: 'zt', tokenIndex, row, col },
    disabled: !canAcceptZtSwap,
  });
  const isValidZtHover = isOver && canAcceptZtSwap;
  const isInvalidZtHover = isOver && isDraggingZT && !canAcceptZtSwap;

  return (
    <span
      ref={setDropRef}
      style={{ display: 'inline-block' }}
      className={`${isAdjacentSwapTarget ? 'ring-1 ring-green-200 rounded' : ''} ${isValidZtHover ? 'ring-2 ring-green-300 rounded bg-green-50' : ''} ${isInvalidZtHover ? 'ring-2 ring-red-300 rounded bg-red-50' : ''}`}
    >
      <span ref={setNodeRef} style={{ touchAction: 'none' }}>
        <span
          {...attributes}
          {...listeners}
          className={`inline-block text-xs px-1 py-0.5 rounded font-mono border select-none ${isLocked ? `cursor-default ${colors.tokenLocked}` : `${isDragging ? 'cursor-grabbing opacity-60' : 'cursor-grab'} ${colors.tokenUnlocked}`} ${isDragging ? 'shadow-sm' : ''}`}
          title={isLocked ? 'Locked token' : 'Drag to swap with adjacent token'}
        >
          {token.text}
        </span>
      </span>
    </span>
  );
};

export default React.memo(ZTTokenComp);
