import type { PTChar } from '../../types/domain';

//when locked token, returns true, so that the token will be rendered as locked and not draggable in the UI
export function tokenIndexIsLockedInColumns(
  columns: { pt: PTChar | null; ct: number[] }[][],
  lockedKeys: Record<string, string>,
  tokenIndex: number
): boolean {
  for (const row of columns) {
    for (const cell of row) {
      if (cell.ct && cell.ct.includes(tokenIndex)) {
        if (cell.pt && typeof lockedKeys?.[cell.pt.ch] === 'string') return true;
      }
    }
  }
  return false;
}
