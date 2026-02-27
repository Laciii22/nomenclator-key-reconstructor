/**
 * Multi-key column mapping for homophone mode.
 * 
 * Builds the PT→CT allocation grid directly from locked keys without
 * shift-based deception cells. Each locked PT character gets multiple
 * columns (one per homophone token).
 */

import type { PTChar, CTToken } from '../types/domain';
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
  ctTokens: CTToken[],
  startIdx: number,
  length: number
): string | null {
  if (startIdx + length > ctTokens.length) return null;
  
  let sequence = '';
  for (let i = 0; i < length; i++) {
    sequence += ctTokens[startIdx + i].text;
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
  ptChar: PTChar,
  tokenPtr: number,
  groupSize: number,
  ctTokens: CTToken[]
): { column: Column; tokensConsumed: number } {
  if (tokenPtr >= ctTokens.length) {
    return { column: { pt: ptChar, ct: [] }, tokensConsumed: 0 };
  }
  
  const groupIndices = createTokenGroup(tokenPtr, groupSize, ctTokens.length);
  return {
    column: { pt: ptChar, ct: groupIndices },
    tokensConsumed: groupIndices.length
  };
}

/**
 * Scan forward to find and allocate a locked token for the character.
 * Marks skipped tokens as deception cells.
 */
function allocateLockedCell(
  ptChar: PTChar,
  lockedTokens: string[],
  tokenPtr: number,
  groupSize: number,
  ctTokens: CTToken[]
): { columns: Column[]; tokensConsumed: number; found: boolean } {
  const deceptionCells: Column[] = [];
  let currentPtr = tokenPtr;
  
  while (currentPtr < ctTokens.length) {
    const currentSeq = buildTokenSequence(ctTokens, currentPtr, groupSize);
    
    if (currentSeq && lockedTokens.includes(currentSeq)) {
      // Found matching locked token
      const groupIndices = createTokenGroup(currentPtr, groupSize, ctTokens.length);
      const matchColumn = { pt: ptChar, ct: groupIndices };
      const consumed = currentPtr + groupIndices.length - tokenPtr;
      
      return {
        columns: [...deceptionCells, matchColumn],
        tokensConsumed: consumed,
        found: true
      };
    }
    
    // Not a match - mark as deception and continue scanning
    const groupIndices = createTokenGroup(currentPtr, groupSize, ctTokens.length);
    deceptionCells.push({ pt: null, ct: groupIndices, deception: true });
    currentPtr += groupIndices.length;
  }
  
  // No match found - return deception cells plus empty column
  return {
    columns: [...deceptionCells, { pt: ptChar, ct: [] }],
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
  ctTokens: CTToken[]
): void {
  if (result.length === 0 || tokenPtr >= ctTokens.length) return;
  
  const lastRow = result[result.length - 1];
  let currentPtr = tokenPtr;
  
  while (currentPtr < ctTokens.length) {
    const groupIndices = createTokenGroup(currentPtr, groupSize, ctTokens.length);
    lastRow.push({ pt: null, ct: groupIndices, deception: true });
    currentPtr += groupIndices.length;
  }
}

/**
 * Count how many times each locked token appears in the CT stream.
 */
function countTokenOccurrences(
  ctTokens: CTToken[],
  lockedTokens: string[],
  groupSize: number
): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const token of lockedTokens) {
    counts.set(token, 0);
  }
  
  for (let i = 0; i < ctTokens.length; i += groupSize) {
    const seq = buildTokenSequence(ctTokens, i, groupSize);
    if (seq && lockedTokens.includes(seq)) {
      counts.set(seq, (counts.get(seq) || 0) + 1);
    }
  }
  
  return counts;
}

/**
 * Build allocation columns for multi-key (homophone) mode.
 * 
 * Works like shift-based allocation BUT respects multi-key locks:
 * - Maintains CT token order (never reorders!)
 * - Distributes homophones sequentially across character occurrences
 * - Shows deception tokens between locks in original CT order
 * 
 * Example separator: PT="AHA", CT="11:22:33", locks: A→[11,33], H→[22]
 * Result: A→11, H→22, A→33 (in CT order)
 * 
 * Example fixed: PT="AHA", CT="11:22:33:44", groupSize=2, locks: A→["1122","3344"], H→["2233"]
 * Result: A→"1122", H→"2233", A→"3344"
 */
export function buildMultiKeyColumns(
  ptRows: PTChar[][],
  ctTokens: CTToken[],
  lockedKeys?: Record<string, string | string[]>,
  selections?: Record<string, string | string[] | null>,
  groupSize: number = 1,
): Column[][] {
  const filteredRows = ptRows.map(r => r.filter(c => c.ch !== ''));
  const allLocked = mergeLockAndSelection(lockedKeys, selections);
  
  const result: Column[][] = [];
  let tokenPtr = 0;
  
  // Count total occurrences of each character in PT
  const ptCharCounts = new Map<string, number>();
  for (const row of filteredRows) {
    for (const cell of row) {
      const ch = cell.ch;
      ptCharCounts.set(ch, (ptCharCounts.get(ch) || 0) + 1);
    }
  }
  
  // For each character with locked tokens, count available tokens in CT
  const availableTokens = new Map<string, Map<string, number>>();
  for (const [ch, lockedTokens] of Object.entries(allLocked)) {
    if (lockedTokens.length > 0) {
      availableTokens.set(ch, countTokenOccurrences(ctTokens, lockedTokens, groupSize));
    }
  }
  
  // Track how many times we've used each locked token for each character
  const usedTokenCount = new Map<string, Map<string, number>>();
  
  for (const rowChars of filteredRows) {
    const rowCols: Column[] = [];
    
    for (const ptChar of rowChars) {
      const ch = ptChar.ch;
      const lockedTokens = allLocked[ch] || [];
      
      if (lockedTokens.length === 0) {
        // No locks - normal allocation
        const { column, tokensConsumed } = allocateNormalCell(
          ptChar,
          tokenPtr,
          groupSize,
          ctTokens
        );
        rowCols.push(column);
        tokenPtr += tokensConsumed;
      } else {
        // Has locked tokens - check if we can still find one
        const available = availableTokens.get(ch);
        const used = usedTokenCount.get(ch) || new Map<string, number>();
        
        // Check if there's at least one locked token still available in CT
        let hasAvailableToken = false;
        for (const token of lockedTokens) {
          const totalInZT = available?.get(token) || 0;
          const alreadyUsed = used.get(token) || 0;
          if (totalInZT > alreadyUsed) {
            hasAvailableToken = true;
            break;
          }
        }
        
        if (!hasAvailableToken) {
          // All confirmed homophones for this char are exhausted at the current
          // CT position. Fall back to sequential allocation (like single-key mode)
          // so the cell still gets a token instead of a red empty error.
          // Marked tentative so the grid can render it amber (unconfirmed mapping).
          const { column, tokensConsumed } = allocateNormalCell(
            ptChar,
            tokenPtr,
            groupSize,
            ctTokens
          );
          rowCols.push({ ...column, tentative: true });
          tokenPtr += tokensConsumed;
        } else {
          // Try to find a locked token in remaining CT
          const { columns, tokensConsumed } = allocateLockedCell(
            ptChar,
            lockedTokens,
            tokenPtr,
            groupSize,
            ctTokens
          );
          
          rowCols.push(...columns);
          tokenPtr += tokensConsumed;
          
          // Track which token we used (if we found one)
          const lastCol = columns[columns.length - 1];
          if (lastCol.pt && lastCol.ct.length > 0) {
            const usedSeq = buildTokenSequence(ctTokens, lastCol.ct[0], groupSize);
            if (usedSeq && lockedTokens.includes(usedSeq)) {
              if (!usedTokenCount.has(ch)) {
                usedTokenCount.set(ch, new Map());
              }
              const charUsed = usedTokenCount.get(ch)!;
              charUsed.set(usedSeq, (charUsed.get(usedSeq) || 0) + 1);
            }
          }
        }
      }
    }
    
    result.push(rowCols);
  }
  
  // Add remaining tokens as deception cells
  appendRemainingTokens(result, tokenPtr, groupSize, ctTokens);
  
  return result;
}
