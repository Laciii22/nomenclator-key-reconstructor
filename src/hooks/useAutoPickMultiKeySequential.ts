import * as React from 'react';
import type { PTChar, CTToken } from '../types/domain';
import { getExpectedCTIndicesForOT } from '../utils/grouping';

/**
 * Automatically identifies deception tokens in multi-key mode.
 * 
 * When user selects homophones for PT characters, this hook determines which
 * CT tokens are deception (not mapped to any PT character) and updates bracketed indices.
 * 
 * Example: PT="AHA", CT="11:22:99:33"
 * - User selects: A→[11,33], H→[22]
 * - Auto-detected deception: 99 (at index 2)
 * - Bracketed indices: [2]
 */
export function useAutoPickMultiKeySequential(params: {
  ptRows: PTChar[][];
  ctTokens: CTToken[];
  lockedKeys: Record<string, string | string[]>;
  keysPerPTMode: 'single' | 'multiple';
  setBracketedIndices: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const { ptRows, ctTokens, lockedKeys, keysPerPTMode, setBracketedIndices } = params;

  React.useEffect(() => {
    // Only run in multi-key mode
    if (keysPerPTMode !== 'multiple') return;
    
    // Only run if we have locked selections
    if (!Object.keys(lockedKeys).length) return;

    // Build expected position map for PT characters
    const expectedPositions = getExpectedCTIndicesForOT(ptRows, ctTokens, []);
    
    // Collect all CT indices that are locked (assigned to PT characters)
    const lockedIndices = new Set<number>();
    
    for (const [ch, lockedValue] of Object.entries(lockedKeys)) {
      // Get expected positions for this character
      const expectedForChar = expectedPositions[ch] || [];
      
      // Get locked tokens (normalize to array)
      const lockedTokens = Array.isArray(lockedValue) ? lockedValue : [lockedValue];
      
      // For each locked token, find its position in CT
      for (const token of lockedTokens) {
        // Find all indices where this token appears
        const tokenIndices = ctTokens
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

    // Any CT index not locked is a deception token
    const deceptionIndices: number[] = [];
    for (let i = 0; i < ctTokens.length; i++) {
      if (!lockedIndices.has(i)) {
        deceptionIndices.push(i);
      }
    }

    // Update bracketed indices
    setBracketedIndices(deceptionIndices);
  }, [ptRows, ctTokens, lockedKeys, keysPerPTMode, setBracketedIndices]);
}
