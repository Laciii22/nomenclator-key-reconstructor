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
import { buildMultiKeyColumns } from '../utils/multiKeyMapping';
import { canShiftLeft, canShiftRight, deriveCountsFromColumns, shiftLeft, shiftRight } from '../mapping/manualShift';

/**
 * Hook for computing and managing the OT→ZT allocation grid.
 */
export function useMapping(params: {
  /** Rows of plain text characters */
  otRows: OTChar[][];
  /** Cipher tokens (after deception filtering) */
  effectiveZtTokens: ZTToken[];
  /** Locked OT→ZT mappings (single-key: string, multi-key: string[]) */
  lockedKeys: Record<string, string | string[]>;
  /** Current manual selections */
  selections: Record<string, string | string[] | null>;
  /** Parse mode */
  ztParseMode: 'separator' | 'fixedLength';
  /** Size of token groups */
  groupSize: number;
  /** Keys per OT mode: 'single' or 'multiple' (homophones) */
  keysPerOTMode: 'single' | 'multiple';
}) {
  const { otRows, effectiveZtTokens, lockedKeys, selections, ztParseMode, groupSize, keysPerOTMode } = params;

  // Base columns: use multi-key mapping for 'multiple' mode, shift mapping for 'single' mode
  const baseColumns: Column[][] = React.useMemo(() => {
    if (keysPerOTMode === 'multiple') {
      // Multi-key mode: build columns directly from multi-key locks (no shift mapping)
      return buildMultiKeyColumns(otRows, effectiveZtTokens, lockedKeys, selections, groupSize);
    } else {
      // Single-key mode: normalize to single-key and use shift-based mapping
      const normalizedLocks: Record<string, string> = {};
      for (const [ch, val] of Object.entries(lockedKeys)) {
        normalizedLocks[ch] = Array.isArray(val) ? val[0] || '' : val;
      }
      const normalizedSelections: Record<string, string | null> = {};
      for (const [ch, val] of Object.entries(selections)) {
        normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
      }
      return buildShiftOnlyColumns(otRows, effectiveZtTokens, normalizedLocks, normalizedSelections, groupSize);
    }
  }, [keysPerOTMode, otRows, effectiveZtTokens, lockedKeys, selections, groupSize]);

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
    
    // Count total cells in baseColumns (including deception)
    const totalBaseCells = baseColumns.reduce((acc, row) => acc + row.length, 0);
    if (manualOtCounts.length !== totalBaseCells) {
      return baseColumns;
    }

    const result: Column[][] = [];
    let ptr = 0;
    let flatIndex = 0;

    for (let r = 0; r < baseColumns.length; r++) {
      const baseRow = baseColumns[r];
      const rowCols: Column[] = [];
      
      for (let c = 0; c < baseRow.length; c++) {
        const baseCol = baseRow[c];
        const count = Math.max(0, manualOtCounts[flatIndex] || 0);
        const indices: number[] = [];
        for (let k = 0; k < count && ptr < effectiveZtTokens.length; k++) {
          indices.push(ptr++);
        }
        
        // Preserve ot and deception from base column
        rowCols.push({ 
          ot: baseCol.ot, 
          zt: indices,
          deception: baseCol.deception 
        });
        flatIndex++;
      }
      result.push(rowCols);
    }

    // Add any remaining unallocated tokens as deception
    if (effectiveZtTokens.length && result.length && ptr < effectiveZtTokens.length) {
      const lastRow = result[result.length - 1];
      const remaining: number[] = [];
      for (let i = ptr; i < effectiveZtTokens.length; i++) remaining.push(i);
      if (remaining.length) lastRow.push({ ot: null, zt: remaining, deception: true });
    }

    return result;
  }, [baseColumns, effectiveZtTokens.length, manualOtCounts, otRows, ztParseMode]);

  const countsForUi = React.useMemo(() => {
    if (ztParseMode !== 'fixedLength') return [] as number[];
    if (manualOtCounts && manualOtCounts.length) return manualOtCounts;
    return deriveCountsFromColumns(baseColumns, groupSize || 1);
  }, [baseColumns, groupSize, manualOtCounts, ztParseMode]);

  const canShiftLeftAt = React.useCallback((index: number) => {
    const maxLen = groupSize || 1;
    // Disallow shifting into/out of a locked OT cell: check neighbor lock status
    try {
      // Build flat view of baseColumns (same order as countsForUi)
      const flatCols: (import('../components/types').Column | null)[] = [];
      for (const row of baseColumns) for (const col of row) flatCols.push(col || null);
      // If left neighbor corresponds to a locked OT, disallow
      if (index - 1 >= 0) {
        const left = flatCols[index - 1];
        if (left && left.ot && typeof left.ot === 'object') {
          const otCh = left.ot.ch;
          if (otCh && Object.prototype.hasOwnProperty.call(lockedKeys, otCh)) return false;
        }
      }
    } catch (e) {
      // fall back to default behavior on error
    }
    return canShiftLeft(countsForUi, index, maxLen);
  }, [countsForUi, groupSize, baseColumns, lockedKeys]);

  const canShiftRightAt = React.useCallback((index: number) => {
    const maxLen = groupSize || 1;
    // Disallow shifting into/out of a locked OT cell: check neighbor lock status
    try {
      const flatCols: (import('../components/types').Column | null)[] = [];
      for (const row of baseColumns) for (const col of row) flatCols.push(col || null);
      // If right neighbor corresponds to a locked OT, disallow
      if (index + 1 < flatCols.length) {
        const right = flatCols[index + 1];
        if (right && right.ot && typeof right.ot === 'object') {
          const otCh = right.ot.ch;
          if (otCh && Object.prototype.hasOwnProperty.call(lockedKeys, otCh)) return false;
        }
      }
    } catch (e) {
      // fall back to default behavior on error
    }
    return canShiftRight(countsForUi, index, maxLen);
  }, [countsForUi, groupSize, baseColumns, lockedKeys]);

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
    // Shift controls only available for fixed-length mode
    if (ztParseMode !== 'fixedLength') {
      return [] as { canShiftLeft: boolean; canShiftRight: boolean }[];
    }
    // Both single and multi-key modes support shifting when there's a mismatch
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
