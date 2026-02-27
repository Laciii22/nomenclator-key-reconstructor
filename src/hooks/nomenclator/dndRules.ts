import type { PTChar } from '../../components/types';

// Kept in a small helper file so the main hook stays readable.
// This is a pure predicate: no React, no state updates.
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
