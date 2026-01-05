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
 * Merge locked keys and selections into a unified structure.
 * Priority: locked keys override selections.
 */
function mergeLockAndSelection(
  lockedKeys?: Record<string, string | string[]>,
  selections?: Record<string, string | string[] | null>
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  
  for (const [ch, val] of Object.entries(lockedKeys || {})) {
    merged[ch] = Array.isArray(val) ? val : val ? [val] : [];
  }
  
  for (const [ch, val] of Object.entries(selections || {})) {
    if (!merged[ch] && val) {
      merged[ch] = Array.isArray(val) ? val : [val];
    }
  }
  
  return merged;
}

/**
 * Build a token sequence from consecutive tokens starting at index.
 * Returns null if sequence would exceed available tokens.
 */
function buildTokenSequence(
  ztTokens: ZTToken[],
  startIdx: number,
  length: number
): string | null {
  if (startIdx + length > ztTokens.length) return null;
  
  let sequence = '';
  for (let i = 0; i < length; i++) {
    sequence += ztTokens[startIdx + i].text;
  }
  
  return sequence;
}

/**
 * Create a group of token indices for the current position.
 */
function createTokenGroup(
  tokenPtr: number,
  groupSize: number,
  maxTokens: number
): number[] {
  const groupIndices: number[] = [];
  for (let g = 0; g < groupSize && tokenPtr + g < maxTokens; g++) {
    groupIndices.push(tokenPtr + g);
  }
  return groupIndices;
}

/**
 * Allocate tokens for a character without locked constraints.
 * Used when character has no locked tokens or all have been consumed.
 */
function allocateNormalCell(
  otChar: OTChar,
  tokenPtr: number,
  groupSize: number,
  ztTokens: ZTToken[]
): { column: Column; tokensConsumed: number } {
  if (tokenPtr >= ztTokens.length) {
    return { column: { ot: otChar, zt: [] }, tokensConsumed: 0 };
  }
  
  const groupIndices = createTokenGroup(tokenPtr, groupSize, ztTokens.length);
  return {
    column: { ot: otChar, zt: groupIndices },
    tokensConsumed: groupIndices.length
  };
}

/**
 * Scan forward to find and allocate a locked token for the character.
 * Marks skipped tokens as deception cells.
 */
function allocateLockedCell(
  otChar: OTChar,
  lockedTokens: string[],
  tokenPtr: number,
  groupSize: number,
  ztTokens: ZTToken[]
): { columns: Column[]; tokensConsumed: number; found: boolean } {
  const deceptionCells: Column[] = [];
  let currentPtr = tokenPtr;
  
  while (currentPtr < ztTokens.length) {
    const currentSeq = buildTokenSequence(ztTokens, currentPtr, groupSize);
    
    if (currentSeq && lockedTokens.includes(currentSeq)) {
      // Found matching locked token
      const groupIndices = createTokenGroup(currentPtr, groupSize, ztTokens.length);
      const matchColumn = { ot: otChar, zt: groupIndices };
      const consumed = currentPtr + groupIndices.length - tokenPtr;
      
      return {
        columns: [...deceptionCells, matchColumn],
        tokensConsumed: consumed,
        found: true
      };
    }
    
    // Not a match - mark as deception and continue scanning
    const groupIndices = createTokenGroup(currentPtr, groupSize, ztTokens.length);
    deceptionCells.push({ ot: null, zt: groupIndices, deception: true });
    currentPtr += groupIndices.length;
  }
  
  // No match found - return deception cells plus empty column
  return {
    columns: [...deceptionCells, { ot: otChar, zt: [] }],
    tokensConsumed: currentPtr - tokenPtr,
    found: false
  };
}

/**
 * Add remaining unallocated tokens as deception cells to the last row.
 */
function appendRemainingTokens(
  result: Column[][],
  tokenPtr: number,
  groupSize: number,
  ztTokens: ZTToken[]
): void {
  if (result.length === 0 || tokenPtr >= ztTokens.length) return;
  
  const lastRow = result[result.length - 1];
  let currentPtr = tokenPtr;
  
  while (currentPtr < ztTokens.length) {
    const groupIndices = createTokenGroup(currentPtr, groupSize, ztTokens.length);
    lastRow.push({ ot: null, zt: groupIndices, deception: true });
    currentPtr += groupIndices.length;
  }
}

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
  const allLocked = mergeLockAndSelection(lockedKeys, selections);
  
  const result: Column[][] = [];
  let tokenPtr = 0;
  
  // Track how many locked tokens have been used per character
  const usedLockedCount: Record<string, number> = {};
  
  for (const rowChars of filteredRows) {
    const rowCols: Column[] = [];
    
    for (const otChar of rowChars) {
      const ch = otChar.ch;
      const lockedTokens = allLocked[ch] || [];
      const alreadyUsed = usedLockedCount[ch] || 0;
      const needsLockedToken = alreadyUsed < lockedTokens.length;
      
      if (lockedTokens.length === 0 || !needsLockedToken) {
        // No locks or all consumed - normal allocation
        const { column, tokensConsumed } = allocateNormalCell(
          otChar,
          tokenPtr,
          groupSize,
          ztTokens
        );
        rowCols.push(column);
        tokenPtr += tokensConsumed;
      } else {
        // Need to find locked token - scan forward
        const { columns, tokensConsumed, found } = allocateLockedCell(
          otChar,
          lockedTokens,
          tokenPtr,
          groupSize,
          ztTokens
        );
        
        rowCols.push(...columns);
        tokenPtr += tokensConsumed;
        
        if (found) {
          usedLockedCount[ch] = alreadyUsed + 1;
        }
      }
    }
    
    result.push(rowCols);
  }
  
  // Add remaining tokens as deception cells
  appendRemainingTokens(result, tokenPtr, groupSize, ztTokens);
  
  return result;
}
