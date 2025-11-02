import { useMemo } from 'react';
import type { KeysPerOTMode, LockedKeys, OTChar, ZTToken } from '../types/domain';
import { computeOTKeys } from '../utils/allocation';

/**
    * Hook to manage key constraints based on the current mode and locked keys.
    * @param keysPerOTMode - Mode indicating whether each OT can have a single or multiple ZT keys.
    * @param lockedKeys - Object mapping OT characters to their locked ZT keys.
    * @param otRows - 2D array representing rows of OT characters.
    * @param ztTokens - Array of ZT tokens.
    * @param effectiveRowGroups - 2D array representing the effective allocation of ZT tokens per OT cell.
    * @return An object containing:
    *  - keyMap: Map of OT characters to their associated ZT keys.
    *  - singleKeyWarnings: Array of warning messages for single key violations.
    *  - validateCandidate: Function to validate a candidate rowGroups against the constraints.
     
**/

export function useKeyConstraints(
  keysPerOTMode: KeysPerOTMode,
  lockedKeys: LockedKeys,
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  effectiveRowGroups: number[][]
) {
  const keyMap = useMemo(() => computeOTKeys(otRows, ztTokens, effectiveRowGroups), [otRows, ztTokens, effectiveRowGroups]);

  const singleKeyWarnings = useMemo(() => {
    const msgs: string[] = [];
    if (keysPerOTMode !== 'single') return msgs;
    for (const [ot, set] of keyMap) {
      if (set.size > 1) msgs.push(`„${ot}” má viac kľúčov (${Array.from(set).join(' ')})`);
    }
    for (const [ot, lockedVal] of Object.entries(lockedKeys)) {
      const set = keyMap.get(ot);
      if (set && set.size > 0 && (set.size !== 1 || Array.from(set)[0] !== lockedVal)) {
        msgs.push(`„${ot}” nezodpovedá zámku (${lockedVal})`);
      }
    }
    return msgs;
  }, [keyMap, keysPerOTMode, lockedKeys]);

  function validateCandidate(candidateGroups: number[][]) {
    const candidate = computeOTKeys(otRows, ztTokens, candidateGroups);
    if (keysPerOTMode === 'single') {
      for (const [, set] of candidate) {
        if (set.size > 1) return false;
      }
    }
    for (const [ot, lockedVal] of Object.entries(lockedKeys)) {
      const set = candidate.get(ot);
      if (set && set.size > 0 && (set.size !== 1 || Array.from(set)[0] !== lockedVal)) return false;
    }
    return true;
  }

  return { keyMap, singleKeyWarnings, validateCandidate };
}
