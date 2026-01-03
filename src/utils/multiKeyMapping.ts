/**
 * Multi-key column mapping for homophone mode.
 * 
 * Builds the OT→ZT allocation grid directly from locked keys without
 * shift-based deception cells. Each locked OT character gets multiple
 * columns (one per homophone token).
 */

import type { OTChar, ZTToken } from '../types/domain';
import type { Column } from '../components/types';

/**
 * Build allocation columns for multi-key (homophone) mode.
 * 
 * Works like shift-based allocation BUT respects multi-key locks:
 * - Maintains ZT token order (never reorders!)
 * - Distributes homophones sequentially across character occurrences
 * - Shows deception tokens between locks in original ZT order
 * 
 * Example separator: OT="AHA", ZT="11:22:33", locks: A→[11,33], H→[22]
 * Result: A→11, H→22, A→33 (in ZT order)
 * 
 * Example fixed: OT="AHA", ZT="11:22:33:44", groupSize=2, locks: A→["1122","3344"], H→["2233"]
 * Result: A→"1122", H→"2233", A→"3344"
 */
export function buildMultiKeyColumns(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  lockedKeys?: Record<string, string | string[]>,
  selections?: Record<string, string | string[] | null>,
  groupSize: number = 1,
): Column[][] {
  const filteredRows = otRows.map(r => r.filter(c => c.ch !== ''));
  
  // Merge locks and selections
  const allLocked: Record<string, string[]> = {};
  for (const [ch, val] of Object.entries(lockedKeys || {})) {
    allLocked[ch] = Array.isArray(val) ? val : val ? [val] : [];
  }
  for (const [ch, val] of Object.entries(selections || {})) {
    if (!allLocked[ch] && val) {
      allLocked[ch] = Array.isArray(val) ? val : [val];
    }
  }
  
  const result: Column[][] = [];
  let tokenPtr = 0;
  
  // Helper: build token sequence from current pointer
  const getTokenSequence = (startIdx: number, length: number): string | null => {
    if (startIdx + length > ztTokens.length) return null;
    let seq = '';
    for (let i = 0; i < length; i++) {
      seq += ztTokens[startIdx + i].text;
    }
    return seq;
  };
  
  // Track how many locked tokens have been used per character
  const usedLockedCount: Record<string, number> = {};
  
  for (let r = 0; r < filteredRows.length; r++) {
    const rowChars = filteredRows[r];
    const rowCols: Column[] = [];
    
    for (let c = 0; c < rowChars.length; c++) {
      const ch = rowChars[c].ch;
      const lockedTokens = allLocked[ch] || [];
      const alreadyUsed = usedLockedCount[ch] || 0;
      
      // Check if we still need to find a locked token for this character
      const needsLockedToken = alreadyUsed < lockedTokens.length;
      
      if (lockedTokens.length === 0 || !needsLockedToken) {
        // No locks OR all locked tokens already used - normal position-based allocation
        if (tokenPtr < ztTokens.length) {
          const groupIndices: number[] = [];
          for (let g = 0; g < groupSize && tokenPtr + g < ztTokens.length; g++) {
            groupIndices.push(tokenPtr + g);
          }
          rowCols.push({ ot: rowChars[c], zt: groupIndices });
          tokenPtr += groupIndices.length;
        } else {
          rowCols.push({ ot: rowChars[c], zt: [] });
        }
      } else {
        // Still need to find a locked token - scan forward
        let found = false;
        
        while (tokenPtr < ztTokens.length) {
          const currentSeq = getTokenSequence(tokenPtr, groupSize);
          
          if (currentSeq && lockedTokens.includes(currentSeq)) {
            // Found a matching locked token
            const groupIndices: number[] = [];
            for (let g = 0; g < groupSize && tokenPtr + g < ztTokens.length; g++) {
              groupIndices.push(tokenPtr + g);
            }
            rowCols.push({ ot: rowChars[c], zt: groupIndices });
            tokenPtr += groupIndices.length;
            usedLockedCount[ch] = alreadyUsed + 1;
            found = true;
            break;
          } else {
            // Not a match - skip as deception
            const groupIndices: number[] = [];
            for (let g = 0; g < groupSize && tokenPtr + g < ztTokens.length; g++) {
              groupIndices.push(tokenPtr + g);
            }
            rowCols.push({ ot: null, zt: groupIndices, deception: true });
            tokenPtr += groupIndices.length;
          }
        }
        
        if (!found) {
          // Couldn't find locked token - empty cell
          rowCols.push({ ot: rowChars[c], zt: [] });
        }
      }
    }
    
    result.push(rowCols);
  }
  
  // Add any remaining tokens as deception cells in the last row
  if (result.length > 0 && tokenPtr < ztTokens.length) {
    const lastRow = result[result.length - 1];
    while (tokenPtr < ztTokens.length) {
      const groupIndices: number[] = [];
      for (let g = 0; g < groupSize && tokenPtr + g < ztTokens.length; g++) {
        groupIndices.push(tokenPtr + g);
      }
      lastRow.push({ ot: null, zt: groupIndices, deception: true });
      tokenPtr += groupIndices.length;
    }
  }
  
  return result;
}
