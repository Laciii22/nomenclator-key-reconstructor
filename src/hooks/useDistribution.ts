import { useEffect, useMemo, useState } from 'react';
import type { OTChar, ZTToken } from '../types/domain';
import { computeRowAlloc, computeFixedGroups, applyCapWithRedistribution } from '../utils/allocation';

/**
 * Custom hook to manage the distribution of ZT tokens across OT rows.
 * It computes the allocation of tokens based on various distribution strategies.
 * @param otRows - 2D array representing rows of OT characters.
 * @param ztTokens - Array of ZT tokens to be distributed.
 * @param opts - Options to control distribution strategies:
 *   - fixedPerOTEnabled: Whether to enable fixed distribution per OT.
 *   - fixedPerOTSize: The fixed size for each OT when enabled.
 *   - maxTokensCapEnabled: Whether to enable maximum token cap.
 *   - maxTokensPerCell: The maximum number of tokens allowed per cell.
 * @returns An object containing:
 *  - rowGroups: Current allocation of tokens per OT cell.
 *  - setRowGroups: Function to manually set the rowGroups.
 *  - effectiveRowGroups: The effective allocation considering the applied constraints.
 */

export function useDistribution(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  opts: { fixedPerOTEnabled: boolean; fixedPerOTSize: number; maxTokensCapEnabled: boolean; maxTokensPerCell: number }
) {
  const [rowGroups, setRowGroups] = useState<number[][]>([]);

  useEffect(() => {
    if (opts.fixedPerOTEnabled) {
      setRowGroups(computeFixedGroups(otRows, ztTokens, Math.max(1, Math.floor(opts.fixedPerOTSize || 1))));
    } else {
      const { groups } = computeRowAlloc(otRows, ztTokens);
      if (opts.maxTokensCapEnabled) {
        const cap = Math.max(1, Math.floor(opts.maxTokensPerCell || 1));
        const { groups: capped } = applyCapWithRedistribution(groups, ztTokens.length, cap);
        setRowGroups(capped);
      } else {
        setRowGroups(groups);
      }
    }
  }, [otRows, ztTokens, opts.fixedPerOTEnabled, opts.fixedPerOTSize, opts.maxTokensCapEnabled, opts.maxTokensPerCell]);

  const effectiveRowGroups = useMemo(() => {
    if (opts.fixedPerOTEnabled) {
      const k = Math.max(1, Math.floor(opts.fixedPerOTSize || 1));
      return rowGroups.map(row => row.map(g => Math.min(k, g)));
    }
    if (opts.maxTokensCapEnabled) {
      const cap = Math.max(1, Math.floor(opts.maxTokensPerCell || 1));
      return rowGroups.map(row => row.map(g => Math.min(cap, g)));
    }
    return rowGroups;
  }, [rowGroups, opts.fixedPerOTEnabled, opts.fixedPerOTSize, opts.maxTokensCapEnabled, opts.maxTokensPerCell]);

  return { rowGroups, setRowGroups, effectiveRowGroups };
}
