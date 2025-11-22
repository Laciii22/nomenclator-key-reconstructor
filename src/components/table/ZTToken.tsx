import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ZTTokenProps } from '../types';



/**
 * ZTTokenComp renders a draggable token representing a piece of the cipher text (ZT).
 *
 * Drag payload includes:
 * - type: 'zt'
 * - token: the token data
 * - tokenIndex: flat index in the ZT stream
 * - row/col: source cell coordinates
 */
const ZTTokenComp: React.FC<ZTTokenProps> = ({ token, tokenIndex, row, col, onEdit }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `zt-${token.id}`,
    data: { type: 'zt', token, tokenIndex, row, col },
  });

  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`inline-block text-xs px-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 cursor-move select-none font-mono ${isDragging ? 'opacity-50' : ''}`}
      title="Klikni pre úpravu, potiahni pre presun"
      onClick={(e) => {
        e.stopPropagation();
        const next = window.prompt('Uprav token', token.text);
        if (next != null && next !== token.text) onEdit?.(tokenIndex, next);
      }}
      style={{ touchAction: 'none' }}
    >
      {token.text}
    </span>
  );
};

export default ZTTokenComp;
