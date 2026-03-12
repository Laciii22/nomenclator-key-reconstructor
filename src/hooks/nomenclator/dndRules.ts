import type { PTChar } from '../../types/domain';

/**
 * Check whether a CT token index belongs to a locked PT cell.
 *
 * When true, the token should be rendered as locked and not be draggable.
 *
 * @param columns Current allocation grid
 * @param lockedKeys Locked PT→CT mappings
 * @param tokenIndex The CT token index to check
 * @returns True if the token sits inside a cell whose PT character is locked
 */
export function tokenIndexIsLockedInColumns(
  columns: { pt: PTChar | null; ct: number[] }[][],
  lockedKeys: Record<string, string>,
  tokenIndex: number
): boolean {
  for (const row of columns) {
    for (const cell of row) {
      if (!cell.ct || !cell.ct.includes(tokenIndex)) continue;
      if (cell.pt && typeof lockedKeys?.[cell.pt.ch] === 'string') return true;
    }
  }
  return false;
}
