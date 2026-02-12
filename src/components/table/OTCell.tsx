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
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { OTCellProps } from '../types';
import ZTTokenComp from './ZTToken';
import { tokensFromIndices, joinTokenTexts } from '../../utils/tokenHelpers';
import padlock from '../../assets/icons/padlock.png';
import plusIcon from '../../assets/icons/plus.png';
import minus from '../../assets/icons/minus.png';
import leftIcon from '../../assets/icons/left-arrow.png';
import rightIcon from '../../assets/icons/right-arrow.png';

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
  flatOtIndex,
  onInsertAfterGroup, 
  onSplitGroup, 
  allowExpandFromStart, 
  highlightedOTChar, 
  hasDuplicateKey, 
  onShiftLeft, 
  onShiftRight, 
  canShiftLeft, 
  canShiftRight,
  activeDragType,
  activeOtSourceRow,
  activeOtSourceCol,
  activeZtTokenIndex,
  keysPerOTMode = 'single',
}) => {
  const isDraggingOT = activeDragType === 'ot';

  // Merge is only valid when dropping onto the immediate right neighbor.
  // Keeping *only* that one droppable enabled dramatically reduces DnD overhead
  // for large grids (collision detection + droppable measuring).
  const sourceRow = isDraggingOT ? activeOtSourceRow : undefined;
  const sourceCol = isDraggingOT ? activeOtSourceCol : undefined;
  const isAdjacentRightCell = typeof sourceRow === 'number'
    && typeof sourceCol === 'number'
    && sourceRow === row
    && sourceCol + 1 === col;
  const isPotentialOtMergeTarget = Boolean(
    isDraggingOT
    && ot
    && !deception
    && !lockedValue
    && isAdjacentRightCell
  );

  const { setNodeRef, isOver } = useDroppable({ 
    id: `cell-${row}-${col}`, 
    data: { row, col, isKlamac: !ot, flatIndex },
    disabled: !isPotentialOtMergeTarget,
  });

  // In fixed-length mode we may want to display up to `groupSize` constituent single-char tokens
  const displayedIndices = React.useMemo((): number[] => {
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
  }, [tokenIndices, ot, isFixedLength, groupSize, allowExpandFromStart, tokens.length]);
  
  const displayedTokens = React.useMemo(() => 
    displayedIndices.length
      ? tokensFromIndices(tokens, displayedIndices).map((token, i) => ({ 
          token, 
          tokenIndex: displayedIndices[i] 
        }))
      : [],
    [displayedIndices, tokens]
  );

  const isEmptyRealOtCell = Boolean(ot) && !deception && displayedTokens.length === 0;
  const isDuplicateKey = Boolean(ot) && !deception && Boolean(hasDuplicateKey);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: ot ? `ot-${row}-${col}` : `ot-empty-${row}-${col}`,
    data: { type: 'ot', otChar: ot?.ch, flatIndex, sourceRow: row, sourceCol: col },
    disabled: !ot || Boolean(lockedValue),
  });

  // Visual-only drop affordance for OT merging (real enforcement in resolveMergeFromEvent + joinOTAt)
  const canAcceptOtMergeDrop = isPotentialOtMergeTarget;

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
  const handleLockToggle = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onLockOT || !ot) return;
    
    if (lockedValue) {
      onUnlockOT?.(ot.ch);
      return;
    }
    
    // In multi-key mode, disable locking from cells (use suggestion checkboxes instead)
    if (keysPerOTMode === 'multiple') return;
    
    if (isEmptyRealOtCell) return;
    
    const groupText = joinTokenTexts(displayedTokens.map(f => f.token));
    if (groupText) onLockOT(ot.ch, groupText);
  }, [displayedTokens, isEmptyRealOtCell, lockedValue, onLockOT, onUnlockOT, ot, keysPerOTMode]);

  // Handle edit or insert in separator mode
  const handleEditOrInsert = React.useCallback((e: React.MouseEvent) => {
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
  }, [displayedTokens, flatIndex, onEditToken, onInsertAfterGroup]);

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
        className={`p-0.5 text-xs rounded border ${
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
        <img src={icon} alt={direction} className="w-1.5 h-1.5" />
      </button>
    );
  };

  // Helper to get OT label className
  const getOtLabelClassName = (
    locked: string | string[] | null | undefined, 
    dragging: boolean, 
    highlighted: boolean
  ) => {
    const baseClasses = 'inline-block px-0.5 py-0 rounded font-mono text-xs font-bold select-none';
    
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
      <div className="text-center font-mono text-xs mt-1.5 flex items-center justify-center gap-0.5">
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
            className="inline-block px-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-mono text-xs" 
            title="Probable deception token"
          >
            !
          </span>
        )}
        {renderShiftButton('right', canShiftRight, onShiftRight)}
      </div>
      {/* Render assigned ZT tokens or empty state */}
      <div className="flex flex-wrap gap-0.5 justify-center">
        {displayedTokens.length === 0 ? (
          <span className={isEmptyRealOtCell ? 'text-red-500 text-xs' : 'text-gray-300 text-xs'}>—</span>
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
                activeDragType={activeDragType}
                activeZtTokenIndex={activeZtTokenIndex}
              />
            );
          })
        )}
      </div>
      {canShowFixedLengthActions && (
        <button
          className="absolute top-0 right-0 p-0.5 text-xs rounded-br bg-purple-100 hover:bg-purple-200 leading-none"
          onClick={() => onInsertAfterGroup?.(flatIndex!)}
          title="Add raw ZT token to this group"
        >
          <img src={plusIcon} alt="edit ZT token" className="w-1.5 h-1.5 " />
        </button>
      )}
      {/* In separator mode show a + to edit the token, or insert when empty */}
      {!isFixedLength && ot && !lockedValue && (
        <button
          className="absolute top-0.5 right-0.5 p-0.5 text-xs rounded-br bg-purple-100 hover:bg-purple-200 leading-none"
          onClick={handleEditOrInsert}
          title={displayedTokens.length === 0 ? 'Insert ZT token for this OT' : 'Edit raw ZT token for this OT'}
        >
          <img src={plusIcon} alt="edit ZT token" className="w-1.5 h-1.5 " />
        </button>
      )}
      {ot && (
        <button
          className={`absolute bottom-0 left-0 p-0.5 text-xs rounded-tl leading-none ${
            keysPerOTMode === 'multiple' && !lockedValue 
              ? 'bg-transparent opacity-30 cursor-not-allowed' 
              : 'bg-transparent hover:bg-gray-100'
          }`}
          onClick={handleLockToggle}
          disabled={(!lockedValue && isEmptyRealOtCell) || (keysPerOTMode === 'multiple' && !lockedValue)}
          title={
            keysPerOTMode === 'multiple' && !lockedValue
              ? 'Use suggestion checkboxes to select homophones ↑'
              : lockedValue 
                ? `Unlock ${ot.ch}` 
                : (isEmptyRealOtCell ? 'Cannot lock an empty cell' : `Lock ${ot.ch}`)
          }
          aria-label={lockedValue ? `Unlock ${ot.ch}` : `Lock ${ot.ch}`}
          aria-pressed={!!lockedValue}
        >
          <img 
            src={padlock} 
            alt="lock" 
            aria-hidden="true" 
            className={`w-1.5 h-1.5 ${lockedValue ? 'opacity-100' : 'opacity-80'}`} 
          />
        </button>
      )}

      {ot && ot.ch.length > 1 && typeof flatOtIndex === 'number' && flatOtIndex >= 0 && (
        <button
          className="absolute top-0.5 left-0.5 p-0.5 text-xs rounded-bl bg-gray-100 hover:bg-gray-200 leading-none"
          onClick={(e) => {
            e.stopPropagation();
            if (lockedValue) return;
            onSplitGroup?.(flatOtIndex!);
          }}
          title={lockedValue ? 'First unlock, then split the group' : 'Split group into individual characters'}
        >
        <img
          src = {minus}
          className="h-1.5 w-1.5"
        />

        </button>
      )}
    </div>
  );
};

export default React.memo(OTCell);
