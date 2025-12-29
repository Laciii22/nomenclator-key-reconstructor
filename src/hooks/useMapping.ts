/**
 * Custom hook for managing OT/ZT allocation mapping.
 * 
 * Computes the grid layout (columns) that maps OT cells to ZT token indices.
 * Supports manual token shifting in fixed-length mode.
 * 
 * @param params OT rows, ZT tokens, locks, selections, and parse mode
 * @returns Computed columns and shift controls
 */

import * as React from 'react';
import type { Column } from '../components/types';
import type { OTChar, ZTToken } from '../types/domain';
import { buildShiftOnlyColumns } from '../utils/shiftMapping';
import { canShiftLeft, canShiftRight, deriveCountsFromColumns, shiftLeft, shiftRight } from '../mapping/manualShift';

/**
 * Hook for computing and managing the OT→ZT allocation grid.
 */
export function useMapping(params: {
  /** Rows of plain text characters */
  otRows: OTChar[][];
  /** Cipher tokens (after deception filtering) */
  effectiveZtTokens: ZTToken[];
  /** Locked OT→ZT mappings */
  lockedKeys: Record<string, string>;
  /** Current manual selections */
  selections: Record<string, string | null>;
  /** Parse mode */
  ztParseMode: 'separator' | 'fixedLength';
  /** Size of token groups */
  groupSize: number;
}) {
  const { otRows, effectiveZtTokens, lockedKeys, selections, ztParseMode, groupSize } = params;

  // Base shift-only columns mapping with deception cells (no manual shifts)
  const baseColumns: Column[][] = React.useMemo(
    () => buildShiftOnlyColumns(otRows, effectiveZtTokens, lockedKeys, selections, groupSize),
    [effectiveZtTokens, groupSize, lockedKeys, otRows, selections],
  );

  // Manual per-OT token counts for fixed-length mode to support interactive shifting.
  // Null means "use baseColumns as-is"; counts are lazily initialized on first shift.
  const [manualOtCounts, setManualOtCounts] = React.useState<number[] | null>(null);

  // Reset manual shifts only when the layout signature changes (OT cell count / token count / groupSize / mode)
  const layoutSig = React.useMemo(() => {
    const totalOtCells = otRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    return `${ztParseMode}:${groupSize}:${totalOtCells}:${effectiveZtTokens.length}`;
  }, [effectiveZtTokens.length, groupSize, otRows, ztParseMode]);

  React.useEffect(() => {
    if (ztParseMode !== 'fixedLength') {
      setManualOtCounts(null);
      return;
    }
    setManualOtCounts(null);
  }, [layoutSig, ztParseMode]);

  const initManualCountsIfNeeded = React.useCallback(() => {
    if (manualOtCounts && manualOtCounts.length) return manualOtCounts;
    const maxLen = groupSize || 1;
    const derived = deriveCountsFromColumns(baseColumns, maxLen);
    setManualOtCounts(derived);
    return derived;
  }, [baseColumns, groupSize, manualOtCounts]);

  // Build final columns.
  const columns: Column[][] = React.useMemo(() => {
    if (ztParseMode !== 'fixedLength' || !manualOtCounts || manualOtCounts.length === 0) {
      return baseColumns;
    }

    const filteredRows = otRows.map(r => r.filter(c => c.ch !== ''));
    const totalOtCells = filteredRows.reduce((acc, r) => acc + r.length, 0);
    if (manualOtCounts.length !== totalOtCells) {
      return baseColumns;
    }

    const result: Column[][] = [];
    let ptr = 0;
    let flatIndex = 0;

    for (let r = 0; r < filteredRows.length; r++) {
      const rowChars = filteredRows[r];
      const rowCols: Column[] = [];
      for (let c = 0; c < rowChars.length; c++) {
        const ot = rowChars[c];
        const count = Math.max(0, manualOtCounts[flatIndex] || 0);
        const indices: number[] = [];
        for (let k = 0; k < count && ptr < effectiveZtTokens.length; k++) {
          indices.push(ptr++);
        }
        rowCols.push({ ot, zt: indices });
        flatIndex++;
      }
      result.push(rowCols);
    }

    if (effectiveZtTokens.length && result.length) {
      const lastRow = result[result.length - 1];
      if (ptr < effectiveZtTokens.length) {
        const remaining: number[] = [];
        for (let i = ptr; i < effectiveZtTokens.length; i++) remaining.push(i);
        if (remaining.length) lastRow.push({ ot: null, zt: remaining, deception: true });
      }
    }

    return result;
  }, [baseColumns, effectiveZtTokens.length, manualOtCounts, otRows, ztParseMode]);

  const countsForUi = React.useMemo(() => {
    if (ztParseMode !== 'fixedLength') return [] as number[];
    if (manualOtCounts && manualOtCounts.length) return manualOtCounts;
    return deriveCountsFromColumns(baseColumns, groupSize || 1);
  }, [baseColumns, groupSize, manualOtCounts, ztParseMode]);

  const canShiftLeftAt = React.useCallback((index: number) => {
    return canShiftLeft(countsForUi, index);
  }, [countsForUi]);

  const canShiftRightAt = React.useCallback((index: number) => {
    return canShiftRight(countsForUi, index);
  }, [countsForUi]);

  const shiftLeftAt = React.useCallback((index: number) => {
    if (ztParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    setManualOtCounts(prev => {
      const base = prev && prev.length ? prev : deriveCountsFromColumns(baseColumns, maxLen);
      const next = shiftLeft(base, index, maxLen);
      return next === base ? prev : next;
    });
  }, [baseColumns, groupSize, ztParseMode]);

  const shiftRightAt = React.useCallback((index: number) => {
    if (ztParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    setManualOtCounts(prev => {
      const base = prev && prev.length ? prev : deriveCountsFromColumns(baseColumns, maxLen);
      const next = shiftRight(base, index, maxLen);
      return next === base ? prev : next;
    });
  }, [baseColumns, groupSize, ztParseMode]);

  const shiftMeta = React.useMemo(() => {
    if (ztParseMode !== 'fixedLength') {
      return [] as { canShiftLeft: boolean; canShiftRight: boolean }[];
    }
    return countsForUi.map((_, idx) => ({
      canShiftLeft: canShiftLeftAt(idx),
      canShiftRight: canShiftRightAt(idx),
    }));
  }, [canShiftLeftAt, canShiftRightAt, countsForUi, ztParseMode]);

  return {
    baseColumns,
    columns,
    manualOtCounts,
    setManualOtCounts,
    initManualCountsIfNeeded,
    shiftLeft: shiftLeftAt,
    shiftRight: shiftRightAt,
    canShiftLeft: canShiftLeftAt,
    canShiftRight: canShiftRightAt,
    shiftMeta,
    countsForUi,
  } as const;
}
