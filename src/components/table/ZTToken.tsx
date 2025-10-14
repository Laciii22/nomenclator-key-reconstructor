import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ZTTokenProps } from '../types';



const ZTTokenComp: React.FC<ZTTokenProps> = ({ token, tokenIndex, row, col }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `zt-${token.id}`,
    data: { type: 'zt', token, tokenIndex, row, col },
  });

  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 cursor-move select-none font-mono ${isDragging ? 'opacity-50' : ''}`}
      title="Move ZT token to another cell"
      style={{ touchAction: 'none' }}
    >
      {token.text}
    </span>
  );
};

export default ZTTokenComp;
