import type { DragEndEvent } from '@dnd-kit/core';

// Resolve a drag-end event into flat merge positions (fromFlat, targetFlat)
// Returns null when the drop does not represent a valid immediate-right merge.
export function resolveMergeFromEvent(evt: DragEndEvent, columns: any[]) {
  const active = evt.active;
  const over = evt.over;
  if (!active || !over) return null;
  const src = (active.data as any)?.current;
  const dst = (over.data as any)?.current;

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
