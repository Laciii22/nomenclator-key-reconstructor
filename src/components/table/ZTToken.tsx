/**
 * ZTToken: A draggable cipher token component.
 * 
 * Represents a single ZT (cipher text) token in the grid.
 * Supports drag-and-drop for manual token reordering.
 * Shows visual state for locked tokens and drag operations.
 */

import React from 'react';
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { ZTTokenProps } from '../types';
import { colors } from '../../utils/colors';

interface DragData {
  type?: 'zt' | 'ot';
  tokenIndex?: number;
}

/**
 * A draggable ZT token component with lock state and swap affordances.
 */
const ZTTokenComp: React.FC<ZTTokenProps> = ({ token, tokenIndex, row, col, onEdit: _onEdit, isLocked }) => {
  const { active } = useDndContext();
  const activeData = (active?.data?.current ?? {}) as DragData;
  const activeType = activeData?.type;
  const isDraggingZT = activeType === 'zt';
  const activeTokenIndex = typeof activeData?.tokenIndex === 'number' ? activeData.tokenIndex : null;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `zt-${token.id}`,
    data: { type: 'zt', token, tokenIndex, row, col },
    disabled: Boolean(isLocked),
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `zt-drop-${tokenIndex}`,
    data: { type: 'zt', tokenIndex, row, col },
  });

  // Visual-only drop affordance for swapping tokens.
  // Real enforcement still happens in the drag-end handler.
  const isAdjacentSwapTarget = isDraggingZT && activeTokenIndex != null && Math.abs(activeTokenIndex - tokenIndex) === 1;
  const canAcceptZtSwap = Boolean(isAdjacentSwapTarget && !isLocked);
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
          className={`inline-block text-xs px-0.5 rounded font-mono border select-none ${isLocked ? `cursor-default ${colors.tokenLocked}` : `${isDragging ? 'cursor-grabbing opacity-60' : 'cursor-grab'} ${colors.tokenUnlocked}`} ${isDragging ? 'shadow-sm' : ''}`}
          title={isLocked ? 'Locked token' : 'Drag to move'}
        >
          {token.text}
        </span>
      </span>
    </span>
  );
};

export default ZTTokenComp;
