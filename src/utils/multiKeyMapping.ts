/**
 * Multi-key column mapping for homophone mode.
 *
 * The allocator walks PT and CT in order. In multi-key mode, user selections
 * are confirmations, not hard constraints for every occurrence. This prevents
 * global forward scanning that can explode into red deception/null chains.
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
 * Try to locate a locked token ahead, but only inside the local movable segment.
 * The scan stops when it reaches a CT group hard-locked for a different PT char.
 */
function allocateLockedWithLocalLookahead(
  ptChar: PTChar,
  lockedTokens: string[],
  tokenPtr: number,
  groupSize: number,
  ctTokens: CTToken[],
  tokenOwners: Map<string, Set<string>>,
  remainingPtByChar: Map<string, number>,
  maxSkippedGroups: number,
): { columns: Column[]; tokensConsumed: number; found: boolean } {
  const cols: Column[] = [];
  let ptr = tokenPtr;
  let skippedGroups = 0;

  while (ptr < ctTokens.length) {
    const seq = buildTokenSequence(ctTokens, ptr, groupSize);
    if (isHardLockedForOtherChar(seq, ptChar.ch, tokenOwners, remainingPtByChar)) {
      break;
    }

    if (seq && lockedTokens.includes(seq)) {
      const groupIndices = createTokenGroup(ptr, groupSize, ctTokens.length);
      cols.push({ pt: ptChar, ct: groupIndices });
      return {
        columns: cols,
        tokensConsumed: ptr + groupIndices.length - tokenPtr,
        found: true,
      };
    }

    if (skippedGroups >= maxSkippedGroups) {
      break;
    }

    const skipped = createTokenGroup(ptr, groupSize, ctTokens.length);
    cols.push({ pt: null, ct: skipped, deception: true });
    ptr += skipped.length;
    skippedGroups += 1;
  }

  return {
    columns: cols,
    tokensConsumed: ptr - tokenPtr,
    found: false,
  };
}

/**
 * Build reverse lookup token -> set of PT chars that have this token locked.
 */
function buildTokenOwnersMap(allLocked: Record<string, string[]>): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();

  for (const [ch, tokens] of Object.entries(allLocked)) {
    for (const token of tokens) {
      if (!owners.has(token)) {
        owners.set(token, new Set());
      }
      owners.get(token)!.add(ch);
    }
  }

  return owners;
}

/**
 * True when the current CT group is hard-locked for a different PT char.
 */
function isHardLockedForOtherChar(
  currentSeq: string | null,
  ptChar: string,
  tokenOwners: Map<string, Set<string>>,
  remainingPtByChar: Map<string, number>,
): boolean {
  if (!currentSeq) return false;

  const owners = tokenOwners.get(currentSeq);
  if (!owners || owners.size === 0) return false;

  // If any owner is not this PT char, this slot must stay for that char.
  for (const owner of owners) {
    if (owner !== ptChar && (remainingPtByChar.get(owner) ?? 0) > 0) return true;
  }

  return false;
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
 * Build allocation columns for multi-key (homophone) mode.
 *
 * Rules:
 * - Keep CT order; never scan-forward and inject deception just to hit selected token.
 * - Locked token that belongs to another PT char is a hard boundary (current cell stays empty).
 * - Otherwise consume sequentially; if current token does not match this char lock, mark tentative.
 * - Lookahead is bounded by `maxLookaheadSkippedGroups`, which equals the excess CT token count.
 */
export function buildMultiKeyColumns(
  ptRows: PTChar[][],
  ctTokens: CTToken[],
  lockedKeys?: Record<string, string | string[]>,
  selections?: Record<string, string | string[] | null>,
  groupSize: number = 1,
  maxLookaheadSkippedGroups: number = 0,
): Column[][] {
  const filteredRows = ptRows.map(r => r.filter(c => c.ch !== ''));
  const allLocked = mergeLockAndSelection(lockedKeys, selections);

  const ptCountByChar = new Map<string, number>();
  for (const rowChars of filteredRows) {
    for (const ptChar of rowChars) {
      ptCountByChar.set(ptChar.ch, (ptCountByChar.get(ptChar.ch) ?? 0) + 1);
    }
  }

  const ctSeqCount = new Map<string, number>();
  for (let ptr = 0; ptr < ctTokens.length; ptr += Math.max(1, groupSize)) {
    const seq = buildTokenSequence(ctTokens, ptr, groupSize);
    if (!seq) continue;
    ctSeqCount.set(seq, (ctSeqCount.get(seq) ?? 0) + 1);
  }

  // Include applied selections as owners so reserved tokens are not consumed by
  // preceding non-owner PT cells in equal-occurrence scenarios.
  const tokenOwners = buildTokenOwnersMap(allLocked);
  const remainingPtByChar = new Map<string, number>();
  for (const rowChars of filteredRows) {
    for (const ptChar of rowChars) {
      remainingPtByChar.set(ptChar.ch, (remainingPtByChar.get(ptChar.ch) ?? 0) + 1);
    }
  }
  
  const result: Column[][] = [];
  let tokenPtr = 0;
  
  for (const rowChars of filteredRows) {
    const rowCols: Column[] = [];
    
    for (const ptChar of rowChars) {
      const ch = ptChar.ch;
      remainingPtByChar.set(ch, Math.max(0, (remainingPtByChar.get(ch) ?? 0) - 1));
      const lockedTokens = allLocked[ch] || [];
      const currentSeq = buildTokenSequence(ctTokens, tokenPtr, groupSize);
      const hardLockedForOther = isHardLockedForOtherChar(currentSeq, ch, tokenOwners, remainingPtByChar);

      if (hardLockedForOther) {
        // Keep token pointer in place. This CT group is reserved for another PT char.
        rowCols.push({ pt: ptChar, ct: [] });
        continue;
      }
      
      if (lockedTokens.length === 0) {
        const { column, tokensConsumed } = allocateNormalCell(ptChar, tokenPtr, groupSize, ctTokens);
        rowCols.push(column);
        tokenPtr += tokensConsumed;
        continue;
      }

      if (lockedTokens.length === 1) {
        const target = lockedTokens[0];
        const exactCountPairing = (ptCountByChar.get(ch) ?? 0) === (ctSeqCount.get(target) ?? 0);
        const { column, tokensConsumed } = allocateNormalCell(ptChar, tokenPtr, groupSize, ctTokens);

        if (column.ct.length === 0) {
          rowCols.push({ pt: ptChar, ct: [] });
          continue;
        }

        if (currentSeq === target) {
          rowCols.push(column);
          tokenPtr += tokensConsumed;
          continue;
        }

        if (exactCountPairing) {
          // Equal PT/CT counts: deterministically shift to next matching occurrence.
          // This preserves 1st->1st, 2nd->2nd pairing without swapping cells.
          const exactShift = allocateLockedWithLocalLookahead(
            ptChar,
            lockedTokens,
            tokenPtr,
            groupSize,
            ctTokens,
            tokenOwners,
            remainingPtByChar,
            Number.MAX_SAFE_INTEGER,
          );

          if (exactShift.found && exactShift.tokensConsumed > 0) {
            rowCols.push(...exactShift.columns);
            tokenPtr += exactShift.tokensConsumed;
            continue;
          }

          // If no match is reachable before a hard-lock boundary, keep empty.
          rowCols.push({ pt: ptChar, ct: [] });
          continue;
        }

        // For strict single-token mapping, attempt bounded shift toward match.
        // This keeps deterministic behavior while avoiding forced tentative consumption.
        const lookahead = allocateLockedWithLocalLookahead(
          ptChar,
          lockedTokens,
          tokenPtr,
          groupSize,
          ctTokens,
          tokenOwners,
          remainingPtByChar,
          maxLookaheadSkippedGroups,
        );

        if (lookahead.found && lookahead.tokensConsumed > 0) {
          rowCols.push(...lookahead.columns);
          tokenPtr += lookahead.tokensConsumed;
          continue;
        }

        rowCols.push({ pt: ptChar, ct: [] });
        continue;
      }

      const { column, tokensConsumed } = allocateNormalCell(ptChar, tokenPtr, groupSize, ctTokens);
      if (column.ct.length === 0) {
        rowCols.push(column);
        tokenPtr += tokensConsumed;
        continue;
      }

      const isConfirmed = !!currentSeq && lockedTokens.includes(currentSeq);
      if (isConfirmed) {
        rowCols.push(column);
        tokenPtr += tokensConsumed;
        continue;
      }

      const lookahead = allocateLockedWithLocalLookahead(
        ptChar,
        lockedTokens,
        tokenPtr,
        groupSize,
        ctTokens,
        tokenOwners,
        remainingPtByChar,
        maxLookaheadSkippedGroups,
      );

      if (lookahead.found && lookahead.tokensConsumed > 0) {
        rowCols.push(...lookahead.columns);
        tokenPtr += lookahead.tokensConsumed;
        continue;
      }

      // No match inside local movable segment: consume sequentially and keep tentative.
      rowCols.push({ ...column, tentative: true });
      tokenPtr += tokensConsumed;
    }
    
    result.push(rowCols);
  }
  
  // Add remaining tokens as deception cells
  appendRemainingTokens(result, tokenPtr, groupSize, ctTokens);
  
  return result;
}
