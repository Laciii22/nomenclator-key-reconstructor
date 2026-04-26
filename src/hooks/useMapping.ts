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
import { normalizeLocks } from '../utils/frequency';
import { deriveCountsFromColumns, shiftLeft, shiftRight } from '../mapping/manualShift';

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

  // Calculate excess tokens to tune lookahead: excess = effective CT groups - PT char count
  const excessGroups = React.useMemo(() => {
    const totalPtChars = ptRows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
    const effectiveGroups = Math.floor(effectiveCtTokens.length / (groupSize || 1));
    return Math.max(0, effectiveGroups - totalPtChars);
  }, [ptRows, effectiveCtTokens.length, groupSize]);

  // Base columns: use multi-key mapping for 'multiple' mode, shift mapping for 'single' mode
  const baseColumns: Column[][] = React.useMemo(() => {
    if (keysPerPTMode === 'multiple') {
      // Multi-key mode: build columns directly from multi-key locks (no shift mapping)
      return buildMultiKeyColumns(ptRows, effectiveCtTokens, lockedKeys, selections, groupSize, excessGroups);
    } else {
      // Single-key mode: normalize to single-key and use shift-based mapping
      const normalizedLocks = normalizeLocks(lockedKeys);
      const normalizedSelections: Record<string, string | null> = {};
      for (const [ch, val] of Object.entries(selections)) {
        normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
      }
      return buildShiftOnlyColumns(ptRows, effectiveCtTokens, normalizedLocks, normalizedSelections, groupSize);
    }
  }, [keysPerPTMode, ptRows, effectiveCtTokens, lockedKeys, selections, groupSize, excessGroups]);

  // Manual per-PT token counts for fixed-length mode to support interactive shifting.
  // Null means "use baseColumns as-is"; counts are lazily initialized on first shift.
  const [manualPtCounts, setManualPtCounts] = React.useState<number[] | null>(null);

  // Tracks which base-cell flat-indices have an injected 1-token null cell AFTER them.
  // Used by extractEdgeToken to split a cell's last/first token into a standalone null cell.
  const [insertedNullAfter, setInsertedNullAfter] = React.useState<Set<number>>(new Set());

  // Build a stable signature of the base mapping topology.
  // Manual shift/extract state references base flat indices, so it must be reset
  // whenever baseColumns structure/content changes (not only token counts).
  const baseColumnsSig = React.useMemo(() => {
    return baseColumns
      .map(row => row
        .map(col => {
          const pt = col.pt?.ch ?? 'null';
          const dec = col.deception ? '1' : '0';
          const ct = Array.isArray(col.ct) ? col.ct.join(',') : '';
          return `${pt}:${dec}:${ct}`;
        })
        .join('|'))
      .join('||');
  }, [baseColumns]);

  const layoutSig = React.useMemo(() => {
    return `${ctParseMode}:${groupSize}:${effectiveCtTokens.length}:${baseColumnsSig}`;
  }, [baseColumnsSig, ctParseMode, effectiveCtTokens.length, groupSize]);

  // Reset manual shifts when the layout signature changes or mode is not fixedLength
  React.useEffect(() => {
    setManualPtCounts(null);
    setInsertedNullAfter(new Set());
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
          deception: baseCol.deception,
          baseFlatIdx: flatIndex,
        });

        // If an injected null cell follows this base cell, emit it now
        if (insertedNullAfter.has(flatIndex) && ptr < effectiveCtTokens.length) {
          rowCols.push({ pt: null, ct: [ptr++], deception: true, insertedAfterBaseFlatIndex: flatIndex });
        }

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
  }, [baseColumns, effectiveCtTokens.length, manualPtCounts, insertedNullAfter, ctParseMode]);

  const countsForUi = React.useMemo(() => {
    if (ctParseMode !== 'fixedLength') return [] as number[];
    if (manualPtCounts && manualPtCounts.length) return manualPtCounts;
    return deriveCountsFromColumns(baseColumns, groupSize || 1);
  }, [baseColumns, groupSize, manualPtCounts, ctParseMode]);

  /** Flatten baseColumns into a 1D array for index-based neighbor access. */
  const flatCols = React.useMemo(() => {
    const flat: (Column | null)[] = [];
    for (const row of baseColumns) for (const col of row) flat.push(col || null);
    return flat;
  }, [baseColumns]);

  const lockedBaseCellIndices = React.useMemo(() => {
    const locked = new Set<number>();
    for (let i = 0; i < flatCols.length; i++) {
      const cell = flatCols[i];
      const ptCh = cell?.pt?.ch;
      if (!ptCh) continue;
      const lock = lockedKeys[ptCh];
      if (typeof lock === 'string' && lock.length > 0) {
        locked.add(i);
        continue;
      }
      if (Array.isArray(lock) && lock.length > 0) {
        locked.add(i);
      }
    }
    return locked;
  }, [flatCols, lockedKeys]);

  const isFlatIndexLocked = React.useCallback((index: number): boolean => {
    return lockedBaseCellIndices.has(index);
  }, [lockedBaseCellIndices]);

  const buildBaseCellTokenTexts = React.useCallback((
    counts: number[],
    insertedAfter: Set<number>,
  ): string[] => {
    const texts: string[] = new Array(flatCols.length).fill('');
    let ptr = 0;
    for (let i = 0; i < flatCols.length; i++) {
      const count = Math.max(0, counts[i] ?? 0);
      let txt = '';
      for (let k = 0; k < count && ptr < effectiveCtTokens.length; k++) {
        txt += effectiveCtTokens[ptr]?.text ?? '';
        ptr++;
      }
      texts[i] = txt;
      if (insertedAfter.has(i) && ptr < effectiveCtTokens.length) {
        ptr += 1;
      }
    }
    return texts;
  }, [effectiveCtTokens, flatCols.length]);

  const lockedTextsChanged = React.useCallback((
    beforeCounts: number[],
    beforeInserted: Set<number>,
    afterCounts: number[],
    afterInserted: Set<number>,
  ): boolean => {
    if (lockedBaseCellIndices.size === 0) return false;
    const beforeTexts = buildBaseCellTokenTexts(beforeCounts, beforeInserted);
    const afterTexts = buildBaseCellTokenTexts(afterCounts, afterInserted);
    for (const idx of lockedBaseCellIndices) {
      if ((beforeTexts[idx] ?? '') !== (afterTexts[idx] ?? '')) return true;
    }
    return false;
  }, [buildBaseCellTokenTexts, lockedBaseCellIndices]);

  /** Check whether the neighbor at `neighborIndex` is a locked PT cell. */
  const isLockedNeighbor = React.useCallback((neighborIndex: number): boolean => {
    if (neighborIndex < 0 || neighborIndex >= flatCols.length) return false;
    return isFlatIndexLocked(neighborIndex);
  }, [flatCols.length, isFlatIndexLocked]);

  const canShiftLeftAt = React.useCallback((index: number) => {
    const maxLen = groupSize || 1;
    if (isFlatIndexLocked(index)) return false;
    if (isLockedNeighbor(index - 1)) return false;
    const next = shiftLeft(countsForUi, index, maxLen);
    if (next === countsForUi) return false;
    if (lockedTextsChanged(countsForUi, insertedNullAfter, next, insertedNullAfter)) return false;
    return true;
  }, [countsForUi, groupSize, insertedNullAfter, isFlatIndexLocked, isLockedNeighbor, lockedTextsChanged]);

  const canShiftRightAt = React.useCallback((index: number) => {
    const maxLen = groupSize || 1;
    if (isFlatIndexLocked(index)) return false;
    if (isLockedNeighbor(index + 1)) return false;
    const next = shiftRight(countsForUi, index, maxLen);
    if (next === countsForUi) return false;
    if (lockedTextsChanged(countsForUi, insertedNullAfter, next, insertedNullAfter)) return false;
    return true;
  }, [countsForUi, groupSize, insertedNullAfter, isFlatIndexLocked, isLockedNeighbor, lockedTextsChanged]);

  const shiftLeftAt = React.useCallback((index: number) => {
    if (ctParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    setManualPtCounts(prev => {
      const base = prev && prev.length ? prev : deriveCountsFromColumns(baseColumns, maxLen);
      const next = shiftLeft(base, index, maxLen);
      if (next === base) return prev;
      if (lockedTextsChanged(base, insertedNullAfter, next, insertedNullAfter)) return prev;
      return next;
    });
  }, [baseColumns, groupSize, ctParseMode, lockedTextsChanged, insertedNullAfter]);

  const shiftRightAt = React.useCallback((index: number) => {
    if (ctParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    setManualPtCounts(prev => {
      const base = prev && prev.length ? prev : deriveCountsFromColumns(baseColumns, maxLen);
      const next = shiftRight(base, index, maxLen);
      if (next === base) return prev;
      if (lockedTextsChanged(base, insertedNullAfter, next, insertedNullAfter)) return prev;
      return next;
    });
  }, [baseColumns, groupSize, ctParseMode, lockedTextsChanged, insertedNullAfter]);

  /**
   * Extract the last (direction='right') or first (direction='left') token from the cell at
   * baseFlatIndex into a brand-new standalone null cell placed in the gap beside it.
   * This is triggered by drag-dropping a ZT token onto an edge strip in the mapping grid.
   */
  const extractEdgeToken = React.useCallback((baseFlatIndex: number, direction: 'left' | 'right') => {
    if (ctParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    const base = manualPtCounts && manualPtCounts.length ? manualPtCounts : deriveCountsFromColumns(baseColumns, maxLen);
    if (baseFlatIndex < 0 || baseFlatIndex >= base.length) return;
    if (isFlatIndexLocked(baseFlatIndex)) return;
    if (base[baseFlatIndex] <= 0) return; // nothing to extract

    const nextCounts = [...base];
    nextCounts[baseFlatIndex] = nextCounts[baseFlatIndex] - 1;

    const nextInserted = new Set(insertedNullAfter);
    // For 'right': inject null AFTER source cell (= at sourceFlatIndex)
    // For 'left':  inject null AFTER the cell immediately to the LEFT of source (= sourceFlatIndex - 1)
    const insertAfter = direction === 'right' ? baseFlatIndex : baseFlatIndex - 1;
    if (insertAfter >= 0) nextInserted.add(insertAfter);

    if (lockedTextsChanged(base, insertedNullAfter, nextCounts, nextInserted)) return;

    setManualPtCounts(nextCounts);
    setInsertedNullAfter(nextInserted);
  }, [baseColumns, groupSize, ctParseMode, isFlatIndexLocked, manualPtCounts, insertedNullAfter, lockedTextsChanged]);

  /**
   * Absorb an injected null cell's token back into an adjacent PT cell.
   * Removes the null injection marker and increases the destination cell's token count.
   */
  const reabsorbNullToken = React.useCallback((insertedAfterBase: number, destBaseFlatIndex: number) => {
    if (ctParseMode !== 'fixedLength') return;
    const maxLen = groupSize || 1;
    const base = manualPtCounts && manualPtCounts.length ? manualPtCounts : deriveCountsFromColumns(baseColumns, maxLen);
    if (destBaseFlatIndex < 0 || destBaseFlatIndex >= base.length) return;
    if (isFlatIndexLocked(destBaseFlatIndex)) return;

    const nextCounts = [...base];
    nextCounts[destBaseFlatIndex] = nextCounts[destBaseFlatIndex] + 1;

    const nextInserted = new Set(insertedNullAfter);
    nextInserted.delete(insertedAfterBase);

    if (lockedTextsChanged(base, insertedNullAfter, nextCounts, nextInserted)) return;

    setInsertedNullAfter(nextInserted);
    setManualPtCounts(nextCounts);
  }, [baseColumns, groupSize, ctParseMode, isFlatIndexLocked, manualPtCounts, insertedNullAfter, lockedTextsChanged]);

  /**
   * Higher-level helper: given the dragged CT token index and the strip direction,
   * finds the owning base cell and calls extractEdgeToken.
   * In fixed-length mode cells store only the group-start index so we do a range check.
   */
  const extractEdgeTokenByCtIndex = React.useCallback((ctTokenIndex: number, direction: 'left' | 'right') => {
    const gs = groupSize || 1;
    let sourceFlatIndex = -1;
    let flatCounter = 0;
    outer: for (const row of columns) {
      for (const cell of row) {
        if (typeof cell.insertedAfterBaseFlatIndex === 'number') continue; // skip injected nulls
        if (cell.ct.length > 0) {
          const base = cell.ct[0];
          if (ctTokenIndex >= base && ctTokenIndex <= base + gs - 1) {
            sourceFlatIndex = flatCounter;
            break outer;
          }
        }
        flatCounter++;
      }
    }
    if (sourceFlatIndex >= 0) {
      // RIGHT strip of dest → source is to its right → null between dest and source → 'left'
      // LEFT  strip of dest → source is to its left  → null between source and dest → 'right'
      extractEdgeToken(sourceFlatIndex, direction === 'right' ? 'left' : 'right');
    }
  }, [columns, groupSize, extractEdgeToken]);

  /**
   * Higher-level helper: given the strip direction and where the null was injected,
   * computes the destination base flat index and calls reabsorbNullToken.
   */
  const reabsorbNullByDirection = React.useCallback((insertedAfterBase: number, direction: 'left' | 'right') => {
    // Null was injected AFTER base cell N.
    // RIGHT strip of dest → dest is to the LEFT  of null → destBase = N
    // LEFT  strip of dest → dest is to the RIGHT of null → destBase = N + 1
    const destBase = direction === 'right' ? insertedAfterBase : insertedAfterBase + 1;
    reabsorbNullToken(insertedAfterBase, destBase);
  }, [reabsorbNullToken]);

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
    extractEdgeToken,
    reabsorbNullToken,
    extractEdgeTokenByCtIndex,
    reabsorbNullByDirection,
  } as const;
}
