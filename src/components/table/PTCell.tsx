/**
 * PTCell: A single grid cell representing an PT character and its allocated CT tokens.
 * 
 * Features:
 * - Displays CT tokens allocated to this PT character
 * - Drag-and-drop support for merging adjacent PT cells
 * - Lock/unlock controls for fixing PT→CT mappings
 * - Fixed-length mode: shift controls and group expansion
 * - Visual feedback for errors (empty, duplicate, highlighted)
 */

import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { PTCellProps } from '../types';
import CTTokenComp from './CTToken';
import { tokensFromIndices, joinTokenTexts, expandDisplayedIndices } from '../../utils/tokenHelpers';
import padlock from '../../assets/icons/padlock.png';
import plusIcon from '../../assets/icons/plus.png';
import minus from '../../assets/icons/minus.png';
import leftIcon from '../../assets/icons/left-arrow.png';
import rightIcon from '../../assets/icons/right-arrow.png';
import { useMappingCellContext } from './MappingCellContext';
import PromptModal from '../common/PromptModal';

/** Pure helper — computes the className for the PT character label. */
function getPtLabelClassName(
  locked: string | string[] | null | undefined,
  dragging: boolean,
  highlighted: boolean,
): string {
  const baseClasses = 'inline-block px-1 py-0.5 rounded font-mono text-sm font-bold select-none border';

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
}

/**
 * A single PT grid cell with its allocated CT tokens.
 * Supports drag-and-drop, locking, and visual error states.
 *
 * Grid-level values (token array, lock state, callbacks, DnD active drag,
 * shift metadata, etc.) are consumed from MappingCellContext — no prop
 * threading required.
 */
const PTCell: React.FC<PTCellProps> = ({
  pt,
  tokenIndices,
  row,
  col,
  deception,
  flatIndex,
  flatPtIndex,
  baseFlatIndex,
  onInsertAfterGroup,
  allowExpandFromStart = false, // undefined treated as false
  hasDuplicateKey,
  isTentative = false,
}) => {
  // ── Grid-level values from context ────────────────────────────────────────
  const {
    ctTokens: tokens,
    keysPerPTMode,
    highlightedPTChar,
    lockedKeys,
    onLockOT,
    onUnlockOT,
    onEditToken,
    groupSize = 1,
    activeDragType,
    activePtSourceRow,
    activePtSourceCol,
    activeCtTokenIndex,
    onSplitGroup,
    onShiftGroupLeft,
    onShiftGroupRight,
    shiftMeta,
    activeCtIsFromNull,
    activeCtSourceCellCount,
  } = useMappingCellContext();

  const isFixedLength = groupSize > 1;

  // Derive shift permissions for THIS cell from the shared shiftMeta array
  const canShiftLeft = (shiftMeta && typeof flatIndex === 'number')
    ? (shiftMeta[flatIndex]?.canShiftLeft ?? false) : false;
  const canShiftRight = (shiftMeta && typeof flatIndex === 'number')
    ? (shiftMeta[flatIndex]?.canShiftRight ?? false) : false;

  // ── PromptModal state (replaces window.prompt for token editing) ──────────
  const [editPromptOpen, setEditPromptOpen] = React.useState(false);
  const [editPromptInitial, setEditPromptInitial] = React.useState('');
  // When we handle an action on pointer down, browsers may still fire a click
  // afterwards (or may cancel it). Use this flag to avoid double-triggering.
  const suppressNextClickRef = React.useRef(false);

  const runPointerAction = React.useCallback((e: React.PointerEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    suppressNextClickRef.current = true;
    // Reset soon even if click is canceled.
    window.setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 0);
    action();
  }, []);

  const isDraggingOT = activeDragType === 'pt';

  // Merge is only valid when dropping onto the immediate right neighbor.
  // Keeping *only* that one droppable enabled dramatically reduces DnD overhead
  // for large grids (collision detection + droppable measuring).
  const sourceRow = isDraggingOT ? activePtSourceRow : undefined;
  const sourceCol = isDraggingOT ? activePtSourceCol : undefined;
  const isAdjacentRightCell = typeof sourceRow === 'number'
    && typeof sourceCol === 'number'
    && sourceRow === row
    && sourceCol + 1 === col;
  const isPotentialPtMergeTarget = Boolean(
    isDraggingOT
    && pt
    && !deception
    && !lockedKeys[pt?.ch ?? '']
    && isAdjacentRightCell
  );

  const { setNodeRef, isOver } = useDroppable({ 
    id: `cell-${row}-${col}`, 
    data: { row, col, isKlamac: !pt, flatIndex },
    disabled: !isPotentialPtMergeTarget,
  });

  // ── Left / right edge CT-shift strips (fixed-length mode only) ───────────
  // When a ZT token is dragged in fixed-length mode, each cell shows:
  //   LEFT strip  - active when dragged token is exactly one BEFORE this cell's first token
  //   RIGHT strip - active when dragged token is exactly one AFTER this cell's last token
  // Dropping shifts the source cell's token one step toward the gap.
  const isDraggingZT = activeDragType === 'ct';
  const activeIdx = typeof activeCtTokenIndex === 'number' ? activeCtTokenIndex : null;

  const firstTokenIdx = tokenIndices.length > 0 ? tokenIndices[0] : null;
  const lastTokenIdx  = tokenIndices.length > 0 ? tokenIndices[tokenIndices.length - 1] : null;

  // Always register droppables when dragging ZT in fixedLength so dnd-kit sees them immediately.
  // Validity is signalled via the `active` flag in data so the handler can reject wrong drops.
  // Includes null/deception cells as destinations for reabsorption/extraction edge drops.
  const showEdgeStrips = isDraggingZT && isFixedLength;
  // For extraction: source must have >1 token (so original cell doesn't go empty).
  // For reabsorption (dragging from a null cell): this DESTINATION cell must have room (< groupSize tokens).
  const sourceCount = activeCtSourceCellCount ?? 0;
  const isNullSource = activeCtIsFromNull ?? false;
  const sourceCanInteract = isNullSource
    ? tokenIndices.length < groupSize   // reabsorb: dest must have room, else token would overflow
    : (sourceCount > 1);                // extract: source must not be left empty
  const isActiveLeftStrip  = activeIdx !== null && firstTokenIdx !== null && activeIdx === firstTokenIdx - 1 && sourceCanInteract;
  const isActiveRightStrip = activeIdx !== null && lastTokenIdx  !== null && activeIdx === lastTokenIdx  + 1 && sourceCanInteract;

  const { setNodeRef: setLeftStripRef,  isOver: isOverLeftStrip  } = useDroppable({
    id: `ct-edge-left-${row}-${col}`,
    data: { type: 'ct-edge', direction: 'left', flatIndex, baseFlatIndex, active: isActiveLeftStrip },
    disabled: !showEdgeStrips,
  });
  const { setNodeRef: setRightStripRef, isOver: isOverRightStrip } = useDroppable({
    id: `ct-edge-right-${row}-${col}`,
    data: { type: 'ct-edge', direction: 'right', flatIndex, baseFlatIndex, active: isActiveRightStrip },
    disabled: !showEdgeStrips,
  });

  // In fixed-length mode we may want to display up to `groupSize` constituent single-char tokens
  const displayedIndices = React.useMemo((): number[] => {
    if (!Array.isArray(tokenIndices) || tokenIndices.length === 0) return [];
    if (!pt) return tokenIndices.slice();
    return expandDisplayedIndices(tokenIndices, groupSize, !!allowExpandFromStart, tokens.length);
  }, [tokenIndices, pt, groupSize, allowExpandFromStart, tokens.length]);
  
  const displayedTokens = React.useMemo(() => 
    displayedIndices.length
      ? tokensFromIndices(tokens, displayedIndices).map((token, i) => ({ 
          token, 
          tokenIndex: displayedIndices[i] 
        }))
      : [],
    [displayedIndices, tokens]
  );

  // Derive locked state from context lockedKeys instead of receiving it as a prop
  const lockedValue = React.useMemo((): string | undefined => {
    if (!pt) return undefined;
    const lock = lockedKeys[pt.ch];
    if (!lock) return undefined;
    const currentText = displayedTokens.map(f => f.token.text).join('');
    if (!currentText) return undefined;
    if (Array.isArray(lock)) return lock.includes(currentText) ? currentText : undefined;
    return lock === currentText ? lock : undefined;
  }, [pt, lockedKeys, displayedTokens]);

  const isEmptyRealPtCell = Boolean(pt) && !deception && displayedTokens.length === 0;
  const isDuplicateKey = Boolean(pt) && !deception && Boolean(hasDuplicateKey);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: pt ? `pt-${row}-${col}` : `pt-empty-${row}-${col}`,
    data: { type: 'pt', ptChar: pt?.ch, flatIndex, sourceRow: row, sourceCol: col },
    disabled: !pt || Boolean(lockedValue),
  });

  // Visual-only drop affordance for PT merging (real enforcement in resolveMergeFromEvent in MappingGrid)
  const canAcceptPtMergeDrop = isPotentialPtMergeTarget;

  const isValidDropTarget = isDraggingOT && pt && !deception;
  const isInvalidPtHover = isOver && isDraggingOT && !canAcceptPtMergeDrop;
  const isValidPtHover = isOver && isDraggingOT && canAcceptPtMergeDrop;

  const hasError = deception || (isEmptyRealPtCell && !isTentative) || isDuplicateKey;
  const isHighlighted = Boolean(pt && highlightedPTChar === pt.ch);
  const canShowFixedLengthActions = Boolean(
    isFixedLength 
    && !lockedValue 
    && typeof flatIndex === 'number' 
    && flatIndex >= 0
  );

  // Handle lock/unlock toggle.
  // In multi-key mode the button works additively:
  //   - cell token already locked → remove just that token (specific unlock)
  //   - cell token not yet locked → add it to the homophone set
  const toggleLock = React.useCallback(() => {
    if (!onLockOT || !pt) return;
    
    if (lockedValue) {
      // In multi mode pass the specific token so only it gets removed from the array.
      const specificToken = typeof lockedValue === 'string' ? lockedValue : undefined;
      onUnlockOT?.(pt.ch, keysPerPTMode === 'multiple' ? specificToken : undefined);
      return;
    }
    
    if (isEmptyRealPtCell) return;
    
    const groupText = joinTokenTexts(displayedTokens.map(f => f.token));
    if (groupText) onLockOT(pt.ch, groupText);
  }, [displayedTokens, isEmptyRealPtCell, lockedValue, onLockOT, onUnlockOT, pt, keysPerPTMode]);

  // Handle edit or insert in separator mode.
  // Opens PromptModal instead of calling window.prompt().
  const editOrInsert = React.useCallback(() => {
    if (displayedTokens.length === 0) {
      if (typeof flatIndex === 'number' && flatIndex >= 0) {
        onInsertAfterGroup?.(flatIndex);
      }
      return;
    }
    
    if (!onEditToken) return;
    
    const currentGroupText = displayedTokens.map(f => f.token.text).join('');
    setEditPromptInitial(currentGroupText);
    setEditPromptOpen(true);
  }, [displayedTokens, flatIndex, onEditToken, onInsertAfterGroup]);

  const splitGroup = React.useCallback(() => {
    if (lockedValue) return;
    if (typeof flatPtIndex !== 'number' || flatPtIndex < 0) return;
    onSplitGroup?.(flatPtIndex);
  }, [flatPtIndex, lockedValue, onSplitGroup]);

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
        onPointerDown={(e) => {
          if (!canShift || !onShift) {
            e.stopPropagation();
            return;
          }
          runPointerAction(e, () => onShift(flatIndex!));
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Keyboard activation fallback.
          if (suppressNextClickRef.current) return;
          if (!canShift || !onShift) return;
          onShift(flatIndex!);
        }}
        disabled={!canShift}
        title={title}
      >
        <img src={icon} alt={direction} className="w-3 h-3" />
      </button>
    );
  };

  const cellBaseClasses = 'relative border rounded p-0.5 shadow-sm transition-colors';
  const cellColorClasses = hasError
    ? 'bg-red-50 border-red-300'
    : isTentative
      ? 'bg-amber-50 border-amber-300'
      : 'bg-white border-gray-200';
  const cellDropHintClasses = isValidDropTarget && canAcceptPtMergeDrop 
    ? 'ring-1 ring-green-200' 
    : '';
  const cellHoverClasses = isValidPtHover 
    ? 'bg-green-50 border-green-300 ring-2 ring-green-300' 
    : isInvalidPtHover 
      ? 'bg-red-50 border-red-300 ring-2 ring-red-300' 
      : '';
  const cellDragClasses = isDragging ? 'opacity-70' : '';
  const cellHighlightClasses = isHighlighted ? 'ring-2 ring-purple-400 bg-purple-50' : '';

  const cellClassName = `${cellBaseClasses} ${cellColorClasses} ${cellDropHintClasses} ${cellHoverClasses} ${cellDragClasses} ${cellHighlightClasses}`;

  return (
    <>
      <div ref={setNodeRef} className={cellClassName}>
      {/* LEFT edge strip — covers left 1/3 of cell; active when source token is immediately to the left */}
      {showEdgeStrips && (
        <div
          ref={setLeftStripRef}
          className={`absolute left-0 top-0 bottom-0 w-1/3 rounded-l z-20 transition-colors pointer-events-auto ${
            isActiveLeftStrip
              ? isOverLeftStrip
                ? 'bg-orange-400 opacity-90'
                : 'bg-orange-200 opacity-60'
              : 'opacity-0'
          }`}
          title={isActiveLeftStrip ? 'Drop to shift token into this gap' : undefined}
        />
      )}
      {/* RIGHT edge strip — covers right 1/3 of cell; active when source token is immediately to the right */}
      {showEdgeStrips && (
        <div
          ref={setRightStripRef}
          className={`absolute right-0 top-0 bottom-0 w-1/3 rounded-r z-20 transition-colors pointer-events-auto ${
            isActiveRightStrip
              ? isOverRightStrip
                ? 'bg-orange-400 opacity-90'
                : 'bg-orange-200 opacity-60'
              : 'opacity-0'
          }`}
          title={isActiveRightStrip ? 'Drop to shift token into this gap' : undefined}
        />
      )}
      {/* Render PT label with optional left/right shift buttons */}
      <div className="text-center font-mono text-xs mt-1 mb-0.5 flex items-center justify-center gap-0.5">
        {renderShiftButton('left', canShiftLeft, onShiftGroupLeft)}
        {pt ? (
          <span
            ref={setDragRef}
            {...attributes}
            {...(!lockedValue ? listeners : {})}
            className={getPtLabelClassName(lockedValue, isDragging, isHighlighted)}
            title={lockedValue ? `PT: ${pt.ch} — locked (${Array.isArray(lockedValue) ? lockedValue.join(', ') : lockedValue})` : `PT: ${pt.ch}`}
          >
            {pt.ch}
          </span>
        ) : (
          <span 
            className="inline-block px-1 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 font-mono text-xs font-semibold" 
            title="Probable deception / null token"
          >
            null
          </span>
        )}
        {renderShiftButton('right', canShiftRight, onShiftGroupRight)}
      </div>
      {/* Render assigned CT tokens or empty state */}
      <div className="flex flex-wrap gap-0.5 justify-center">
        {displayedTokens.length === 0 ? (
          <span className={isEmptyRealPtCell ? 'text-red-400 text-xs font-semibold' : 'text-gray-300 text-xs'} title={isEmptyRealPtCell ? 'No token assigned' : undefined}>∅</span>
        ) : (
          displayedTokens.map(({ token, tokenIndex }, i) => {
            const currentGroupText = displayedTokens.map(x => x.token.text).join('');
            const isTokenLocked = Boolean(lockedValue && lockedValue === currentGroupText);

            return (
              <CTTokenComp
                key={`${token.id}-${i}`}
                token={token}
                tokenIndex={tokenIndex}
                row={row}
                col={col}
                onEdit={onEditToken}
                isLocked={isTokenLocked}
                activeDragType={activeDragType}
                activeCtTokenIndex={activeCtTokenIndex}
              />
            );
          })
        )}
      </div>
      {canShowFixedLengthActions && (
        <button
          className="absolute top-0 right-0 p-0.5 text-xs rounded-br bg-purple-50 hover:bg-purple-200 border-l border-b border-purple-100 leading-none"
          onPointerDown={(e) => {
            if (typeof flatIndex !== 'number' || flatIndex < 0) {
              e.stopPropagation();
              return;
            }
            runPointerAction(e, () => onInsertAfterGroup?.(flatIndex));
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (suppressNextClickRef.current) return;
            onInsertAfterGroup?.(flatIndex!);
          }}
          title="Add raw CT token to this group"
        >
          <img src={plusIcon} alt="edit CT token" className="w-3 h-3" />
        </button>
      )}
      {/* In separator mode show a + to edit the token, or insert when empty */}
      {!isFixedLength && pt && !lockedValue && (
        <button
          className="absolute top-0.5 right-0.5 p-0.5 text-xs rounded bg-purple-50 hover:bg-purple-200 border border-purple-100"
          onPointerDown={(e) => {
            runPointerAction(e, editOrInsert);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (suppressNextClickRef.current) return;
            editOrInsert();
          }}
          title={displayedTokens.length === 0 ? 'Insert CT token for this PT' : 'Edit raw CT token for this PT'}
        >
          <img src={plusIcon} alt="edit CT token" className="w-3 h-3" />
        </button>
      )}
      {pt && (
        <button
          className={`absolute bottom-0 left-0 p-1 text-xs rounded-tr leading-none ${
            !lockedValue && isEmptyRealPtCell
              ? 'opacity-20 cursor-not-allowed'
              : 'hover:bg-gray-100'
          }`}
          onPointerDown={(e) => {
            // Run on pointer down to avoid click cancellation in complex DnD/virtualized UIs.
            if (!lockedValue && isEmptyRealPtCell) {
              e.stopPropagation();
              return;
            }
            runPointerAction(e, toggleLock);
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Keyboard activation fallback.
            if (suppressNextClickRef.current) return;
            toggleLock();
          }}
          disabled={!lockedValue && isEmptyRealPtCell}
          title={
            lockedValue
              ? (keysPerPTMode === 'multiple' ? `Remove homophone ${lockedValue} from ${pt.ch}` : `Unlock ${pt.ch}`)
              : (isEmptyRealPtCell
                  ? 'Cannot lock an empty cell'
                  : keysPerPTMode === 'multiple'
                    ? `Add ${joinTokenTexts(displayedTokens.map(f => f.token))} as homophone for ${pt.ch}`
                    : `Lock ${pt.ch}`)
          }
          aria-label={lockedValue ? `Unlock ${pt.ch}` : `Lock ${pt.ch}`}
          aria-pressed={!!lockedValue}
        >
          <img 
            src={padlock} 
            alt="lock" 
            aria-hidden="true" 
            className={`w-3.5 h-3.5 ${lockedValue ? 'opacity-100' : 'opacity-60'}`} 
          />
        </button>
      )}

      {pt && pt.ch.length > 1 && typeof flatPtIndex === 'number' && flatPtIndex >= 0 && (
        <button
          className="absolute top-0.5 left-0.5 p-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 border border-gray-200"
          onPointerDown={(e) => {
            runPointerAction(e, splitGroup);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (suppressNextClickRef.current) return;
            splitGroup();
          }}
          title={lockedValue ? 'First unlock, then split the group' : 'Split group into individual characters'}
        >
        <img
          src = {minus}
          className="h-3 w-3"
        />

        </button>
      )}
    </div>
    {/* Non-blocking modal replacement for window.prompt() */}
    <PromptModal
      isOpen={editPromptOpen}
      title="Edit CT Token"
      label="Edit token for this PT (no spaces):"
      initialValue={editPromptInitial}
      onConfirm={(value) => {
        if (value.trim() && onEditToken && displayedTokens.length > 0) {
          onEditToken(displayedTokens[0].tokenIndex, value.trim());
        }
        setEditPromptOpen(false);
      }}
      onCancel={() => setEditPromptOpen(false)}
    />
    </>
  );
};

export default React.memo(PTCell);
