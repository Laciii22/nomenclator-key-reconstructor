import * as React from 'react';
import type { OTChar, ZTToken } from '../types/domain';
import { getExpectedZTIndicesForOT } from '../utils/grouping';

/**
 * Automatically identifies deception tokens in multi-key mode.
 * 
 * When user selects homophones for OT characters, this hook determines which
 * ZT tokens are deception (not mapped to any OT character) and updates bracketed indices.
 * 
 * Example: OT="AHA", ZT="11:22:99:33"
 * - User selects: A→[11,33], H→[22]
 * - Auto-detected deception: 99 (at index 2)
 * - Bracketed indices: [2]
 */
export function useAutoPickMultiKeySequential(params: {
  otRows: OTChar[][];
  ztTokens: ZTToken[];
  lockedKeys: Record<string, string | string[]>;
  keysPerOTMode: 'single' | 'multiple';
  setBracketedIndices: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const { otRows, ztTokens, lockedKeys, keysPerOTMode, setBracketedIndices } = params;

  React.useEffect(() => {
    // Only run in multi-key mode
    if (keysPerOTMode !== 'multiple') return;
    
    // Only run if we have locked selections
    if (!Object.keys(lockedKeys).length) return;

    // Build expected position map for OT characters
    const expectedPositions = getExpectedZTIndicesForOT(otRows, ztTokens, []);
    
    // Collect all ZT indices that are locked (assigned to OT characters)
    const lockedIndices = new Set<number>();
    
    for (const [ch, lockedValue] of Object.entries(lockedKeys)) {
      // Get expected positions for this character
      const expectedForChar = expectedPositions[ch] || [];
      
      // Get locked tokens (normalize to array)
      const lockedTokens = Array.isArray(lockedValue) ? lockedValue : [lockedValue];
      
      // For each locked token, find its position in ZT
      for (const token of lockedTokens) {
        // Find all indices where this token appears
        const tokenIndices = ztTokens
          .map((t, i) => t.text === token ? i : -1)
          .filter(i => i >= 0);
        
        // Mark the first occurrence that matches expected positions as locked
        for (const idx of tokenIndices) {
          if (expectedForChar.includes(idx)) {
            lockedIndices.add(idx);
            break; // Only lock one occurrence per token
          }
        }
      }
    }

    // Any ZT index not locked is a deception token
    const deceptionIndices: number[] = [];
    for (let i = 0; i < ztTokens.length; i++) {
      if (!lockedIndices.has(i)) {
        deceptionIndices.push(i);
      }
    }

    // Update bracketed indices
    setBracketedIndices(deceptionIndices);
  }, [otRows, ztTokens, lockedKeys, keysPerOTMode, setBracketedIndices]);
}
