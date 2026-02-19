import type { OTChar } from '../../components/types';

// Kept in a small helper file so the main hook stays readable.
// This is a pure predicate: no React, no state updates.
export function tokenIndexIsLockedInColumns(
  columns: { ot: OTChar | null; zt: number[] }[][],
  lockedKeys: Record<string, string>,
  tokenIndex: number
): boolean {
  for (const row of columns) {
    for (const cell of row) {
      if (cell.zt && cell.zt.includes(tokenIndex)) {
        if (cell.ot && typeof lockedKeys?.[cell.ot.ch] === 'string') return true;
      }
    }
  }
  return false;
}
