import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ZTTokenProps } from '../types';
import ZTTokenEditor from './ZTTokenEditor';
import { colors } from '../../utils/colors';



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
    disabled: Boolean(isLocked),
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `zt-drop-${tokenIndex}`,
    data: { type: 'zt', tokenIndex, row, col },
  });

  const [editing, setEditing] = useState(false);

  return (
    <span ref={setDropRef} style={{ display: 'inline-block' }}>
      <span ref={setNodeRef} style={{ touchAction: 'none' }}>
      {editing ? (
        <ZTTokenEditor
          tokenText={token.text}
          isLocked={!!isLocked}
          onCommit={(next) => { if (onEdit) onEdit(tokenIndex, next); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span
          {...attributes}
          {...listeners}
          className={`inline-block text-xs px-0.5 rounded font-mono border cursor-${isLocked ? 'default' : 'pointer'} select-none ${isLocked ? colors.tokenLocked : colors.tokenUnlocked} ${isDragging ? 'opacity-50' : ''}`}
          title={isLocked ? 'Locked token – cannot edit' : 'Click to edit, drag to move'}
          onClick={(e) => {
            e.stopPropagation();
            if (isLocked) return;
            setEditing(true);
          }}
          aria-pressed={isLocked}
        >
          {token.text}
        </span>
      )}
      </span>
    </span>
  );
};

export default ZTTokenComp;
