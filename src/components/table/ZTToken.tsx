import React, { useState, useRef, useEffect } from 'react';
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
const ZTTokenComp: React.FC<ZTTokenProps> = ({ token, tokenIndex, row, col, onEdit, isLocked }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `zt-${token.id}`,
    data: { type: 'zt', token, tokenIndex, row, col },
  });

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(token.text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => { setValue(token.text); }, [token.text]);

  function commit() {
    const next = value.trim();
    if (next && next !== token.text && onEdit) onEdit(tokenIndex, next);
    setEditing(false);
  }

  function cancel() {
    setValue(token.text);
    setEditing(false);
  }

  return (
    <span ref={setNodeRef} style={{ touchAction: 'none' }}>
      {editing ? (
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          className="text-xs px-0.5 py-0 rounded border border-blue-300 bg-white text-blue-700 font-mono w-12"
        />
      ) : (
        <span
          {...attributes}
          {...listeners}
          className={`inline-block text-xs px-0.5 rounded font-mono border cursor-${isLocked ? 'default' : 'pointer'} select-none ${isLocked ? 'bg-gray-200 text-gray-600 border-gray-300' : 'bg-blue-50 text-blue-700 border-blue-200'} ${isDragging ? 'opacity-50' : ''}`}
          title={isLocked ? 'Locked token – cannot edit' : 'Click to edit, drag to move'}
          onClick={(e) => {
            e.stopPropagation();
            if (isLocked) return;
            setEditing(true);
          }}
        >
          {token.text}
        </span>
      )}
    </span>
  );
};

export default ZTTokenComp;
