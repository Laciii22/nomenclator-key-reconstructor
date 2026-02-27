/**
 * Custom hook for managing PT/CT allocation mapping.
 * 
 * Computes the grid layout (columns) that maps PT cells to CT token indices.
 * Supports manual token shifting in fixed-length mode.
 * 
 * @param params PT rows, CT tokens, locks, selections, and parse mode
 * @returns Computed columns and shift controls
 */

import * as React from 'react';
import type { Column } from '../components/types';
import type { PTChar, CTToken } from '../types/domain';
import { buildShiftOnlyColumns } from '../utils/shiftMapping';
import { buildMultiKeyColumns } from '../utils/multiKeyMapping';
import { canShiftLeft, canShiftRight, deriveCountsFromColumns, shiftLeft, shiftRight } from '../mapping/manualShift';

/**
 * Hook for computing and managing the PT→CT allocation grid.
 */
export function useMapping(params: {
  /** Rows of plain text characters */
  ptRows: PTChar[][];
  /** Cipher tokens (after deception filtering) */
  effectiveCtTokens: CTToken[];
  /** Locked PT→CT mappings (single-key: string, multi-key: string[]) */
  lockedKeys: Record<string, string | string[]>;
  /** Current manual selections */
  selections: Record<string, string | string[] | null>;
  /** Parse mode */
  ctParseMode: 'separator' | 'fixedLength';
  /** Size of token groups */
  groupSize: number;
  /** Keys per PT mode: 'single' or 'multiple' (homophones) */
  keysPerPTMode: 'single' | 'multiple';
}) {
  const { ptRows, effectiveCtTokens, lockedKeys, selections, ctParseMode, groupSize, keysPerPTMode } = params;

  // Base columns: use multi-key mapping for 'multiple' mode, shift mapping for 'single' mode
  const baseColumns: Column[][] = React.useMemo(() => {
    if (keysPerPTMode === 'multiple') {
      // Multi-key mode: build columns directly from multi-key locks (no shift mapping)
      return buildMultiKeyColumns(ptRows, effectiveCtTokens, lockedKeys, selections, groupSize);
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
      return buildShiftOnlyColumns(ptRows, effectiveCtTokens, normalizedLocks, normalizedSelections, groupSize);
    }
  }, [keysPerPTMode, ptRows, effectiveCtTokens, lockedKeys, selections, groupSize]);

  // Manual per-PT token counts for fixed-length mode to support interactive shifting.
  // Null means "use baseColumns as-is"; counts are lazily initialized on first shift.
  const [manualPtCounts, setManualPtCounts] = React.useState<number[] | null>(null);

  // Reset manual shifts only when the layout signature changes (PT cell count / token count / groupSize / mode)
  const layoutSig = React.useMemo(() => {
    const totalPtCells = ptRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    return `${ctParseMode}:${groupSize}:${totalPtCells}:${effectiveCtTokens.length}`;
  }, [effectiveCtTokens.length, groupSize, ptRows, ctParseMode]);

  React.useEffect(() => {
    if (ctParseMode !== 'fixedLength') {
      setManualPtCounts(null);
      return;
    }
    setManualPtCounts(null);
  }, [layoutSig, ctParseMode]);

  const initManualCountsIfNeeded = React.useCallback(() => {
    if (manualPtCounts && manualPtCounts.length) return manualPtCounts;
    const maxLen = groupSize || 1;
    const derived = deriveCountsFromColumns(baseColumns, maxLen);
    setManualPtCounts(derived);
    return derived;
  }, [baseColumns, groupSize, manualPtCounts]);

  // Build final columns.
  const columns: Column[][] = React.useMemo(() => {
    if (ctParseMode !== 'fixedLength' || !manualPtCounts || manualPtCounts.length === 0) {
      return baseColumns;
    }
    
    // Count total cells in baseColumns (including deception)
    const totalBaseCells = baseColumns.reduce((acc, row) => acc + row.length, 0);
    if (manualPtCounts.length !== totalBaseCells) {
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
        const count = Math.max(0, manualPtCounts[flatIndex] || 0);
        const indices: number[] = [];
        for (let k = 0; k < count && ptr < effectiveCtTokens.length; k++) {
          indices.push(ptr++);
        }
        
        // Preserve pt and deception from base column
        rowCols.push({ 
          pt: baseCol.pt, 
          ct: indices,
          deception: baseCol.deception 
        });
        flatIndex++;
      }
      result.push(rowCols);
    }

    // Add any remaining unallocated tokens as deception
    if (effectiveCtTokens.length && result.length && ptr < effectiveCtTokens.length) {
      const lastRow = result[result.length - 1];
      const remaining: number[] = [];
      for (let i = ptr; i < effectiveCtTokens.length; i++) remaining.push(i);
      if (remaining.length) lastRow.push({ pt: null, ct: remaining, deception: true });
    }

    return result;
  }, [baseColumns, effectiveCtTokens.length, manualPtCounts, ptRows, ctParseMode]);

  const countsForUi = React.useMemo(() => {
    if (ctParseMode !== 'fixedLength') return [] as number[];
    if (manualPtCounts && manualPtCounts.length) return manualPtCounts;
    return deriveCountsFromColumns(baseColumns, groupSize || 1);
  }, [baseColumns, groupSize, manualPtCounts, ctParseMode]);

  const canShiftLeftAt = React.useCallback((index: number) => {
    const maxLen = groupSize || 1;
    // Disallow shifting into/out of a locked PT cell: check neighbor lock status
    try {
      // Build flat view of baseColumns (same order as countsForUi)
      const flatCols: (import('../components/types').Column | null)[] = [];
      for (const row of baseColumns) for (const col of row) flatCols.push(col || null);
      // If left neighbor corresponds to a locked PT, disallow
      if (index - 1 >= 0) {
        const left = flatCols[index - 1];
        if (left && left.pt && typeof left.pt === 'object') {
          const ptCh = left.pt.ch;
          if (ptCh && Object.prototype.hasOwnProperty.call(lockedKeys, ptCh)) return false;
        }
      }
    } catch (e) {
      // fall back to default behavior on error
    }
    return canShiftLeft(countsForUi, index, maxLen);
  }, [countsForUi, groupSize, baseColumns, lockedKeys]);

  const canShiftRightAt = React.useCallback((index: number) => {
    const maxLen = groupSize || 1;
    // Disallow shifting into/out of a locked PT cell: check neighbor lock status
    try {
      const flatCols: (import('../components/types').Column | null)[] = [];
      for (const row of baseColumns) for (const col of row) flatCols.push(col || null);
      // If right neighbor corresponds to a locked PT, disallow
      if (index + 1 < flatCols.length) {
        const right = flatCols[index + 1];
        if (right && right.pt && typeof right.pt === 'object') {
          const ptCh = right.pt.ch;
          if (ptCh && Object.prototype.hasOwnProperty.call(lockedKeys, ptCh)) return false;
        }
      }
    } catch (e) {
      // fall back to default behavior on error
    }
    return canShiftRight(countsForUi, index, maxLen);
  }, [countsForUi, groupSize, baseColumns, lockedKeys]);

  const shiftLeftAt = React.useCallback((index: number) => {
    if (ctParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    setManualPtCounts(prev => {
      const base = prev && prev.length ? prev : deriveCountsFromColumns(baseColumns, maxLen);
      const next = shiftLeft(base, index, maxLen);
      return next === base ? prev : next;
    });
  }, [baseColumns, groupSize, ctParseMode]);

  const shiftRightAt = React.useCallback((index: number) => {
    if (ctParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    setManualPtCounts(prev => {
      const base = prev && prev.length ? prev : deriveCountsFromColumns(baseColumns, maxLen);
      const next = shiftRight(base, index, maxLen);
      return next === base ? prev : next;
    });
  }, [baseColumns, groupSize, ctParseMode]);

  const shiftMeta = React.useMemo(() => {
    // Shift controls only available for fixed-length mode
    if (ctParseMode !== 'fixedLength') {
      return [] as { canShiftLeft: boolean; canShiftRight: boolean }[];
    }
    // Both single and multi-key modes support shifting when there's a mismatch
    return countsForUi.map((_, idx) => ({
      canShiftLeft: canShiftLeftAt(idx),
      canShiftRight: canShiftRightAt(idx),
    }));
  }, [canShiftLeftAt, canShiftRightAt, countsForUi, ctParseMode]);

  return {
    baseColumns,
    columns,
    manualPtCounts,
    setManualPtCounts,
    initManualCountsIfNeeded,
    shiftLeft: shiftLeftAt,
    shiftRight: shiftRightAt,
    canShiftLeft: canShiftLeftAt,
    canShiftRight: canShiftRightAt,
    shiftMeta,
    countsForUi,
  } as const;
}
