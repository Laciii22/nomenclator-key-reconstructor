/**
 * Utilities for drag-and-drop operations in the mapping grid.
 * 
 * Currently supports merging adjacent OT cells by dragging one onto the next.
 */

import type { DragEndEvent } from '@dnd-kit/core';
import type { Column } from '../components/types';

interface DragData {
  sourceRow?: number;
  sourceCol?: number;
  row?: number;
  col?: number;
  isKlamac?: boolean;
}

/**
 * Resolve a drag-end event into a valid merge operation.
 * 
 * A merge is valid when:
 * - Source and target are both OT cells
 * - Target is exactly one column to the right of source
 * - Neither cell is a deception/null cell
 * 
 * @param evt The drag end event from @dnd-kit
 * @param columns The current allocation grid
 * @returns Flat indices for source and target, or null if invalid
 */
export function resolveMergeFromEvent(evt: DragEndEvent, columns: Column[][]) {
  const active = evt.active;
  const over = evt.over;
  if (!active || !over) return null;
  const src = active.data?.current as DragData | undefined;
  const dst = over.data?.current as DragData | undefined;

  // Reject drops onto special (klamac) targets
  if (dst && dst.isKlamac) return null;

  let srcRow: number | undefined = src?.sourceRow;
  let srcCol: number | undefined = src?.sourceCol;
  let dstRow: number | undefined = dst?.row;
  let dstCol: number | undefined = dst?.col;

  if ((dstRow == null || dstCol == null) && typeof over.id === 'string') {
    const m = /^cell-(\d+)-(\d+)$/.exec(over.id as string);
    if (m) {
      dstRow = Number(m[1]);
      dstCol = Number(m[2]);
    }
  }
  if (srcRow == null || srcCol == null || dstRow == null || dstCol == null) return null;

  // Enforce adjacency: target must be exactly next column to the right
  if (!(dstRow === srcRow && dstCol === srcCol + 1)) return null;

  const srcCell = columns[srcRow]?.[srcCol];
  const dstCell = columns[dstRow]?.[dstCol];
  if (!srcCell || !dstCell) return null;
  if (!srcCell.ot || !dstCell.ot) return null;

  // Compute flat indices of non-empty OT cells
  let fromFlat = -1;
  let targetFlat = -1;
  let counter = 0;
  for (let rr = 0; rr < columns.length; rr++) {
    const rowArr = columns[rr];
    for (let cc = 0; cc < rowArr.length; cc++) {
      const cell = rowArr[cc];
      if (cell.ot) {
        if (rr === srcRow && cc === srcCol) fromFlat = counter;
        if (rr === dstRow && cc === dstCol) targetFlat = counter;
        counter++;
      }
    }
  }
  if (fromFlat < 0 || targetFlat < 0) return null;
  return { fromFlat, targetFlat };
}

export default resolveMergeFromEvent;
