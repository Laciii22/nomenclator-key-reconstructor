/**
 * Shift-based column mapping for fixed-length mode.
 * 
 * Builds the PT→CT allocation grid by respecting locked/selected mappings
 * and creating deception cells when necessary to align forced groups.
 * 
 * The algorithm:
 * 1. Iterates through PT cells in row-major order
 * 2. For unlocked cells: allocates groupSize tokens greedily
 * 3. For locked/selected cells: scans forward to find matching token group,
 *    creating deception cells for skipped tokens
 * 4. Handles edge cases like protecting upcoming forced groups
 */

import type { PTChar } from '../types/domain';
import type { Column } from '../components/types';
import type { CTToken } from '../types/domain';

/** Concatenate groupSize token texts starting at `start`. */
function seqAt(start: number, ctTokens: readonly CTToken[], groupSize: number): string | null {
  if (start >= ctTokens.length) return null;
  let s = '';
  for (let g = 0; g < groupSize && start + g < ctTokens.length; g++) s += ctTokens[start + g].text;
  return s;
}

/** Check if taking a single token here protects a forced group at the next position. */
function shouldProtectNextGroup(
  tokenPtr: number,
  groupSize: number,
  ctTokens: readonly CTToken[],
  forcedValues: readonly string[],
  totalPTCells: number,
  processedCells: number,
): boolean {
  const here = seqAt(tokenPtr, ctTokens, groupSize);
  const next = seqAt(tokenPtr + 1, ctTokens, groupSize);
  const remainingPTCells = Math.max(0, totalPTCells - (processedCells + 1));
  const remainingTokensIfTakeOne = ctTokens.length - (tokenPtr + 1);
  const canAccommodateAfterOne = remainingTokensIfTakeOne <= remainingPTCells * groupSize;
  return (
    groupSize > 1 &&
    here !== next &&
    next != null &&
    forcedValues.includes(next) &&
    !forcedValues.includes(here as string) &&
    canAccommodateAfterOne
  );
}

/**
 * Build allocation columns for fixed-length mode with lock/selection awareness.
 * 
 * @param ptRows PT character rows
 * @param ctTokens Raw CT tokens (individual characters in fixed-length mode)
 * @param lockedKeys User-confirmed PT→CT mappings
 * @param selections Current manual selections
 * @param groupSize Size of token groups
 * @returns Column layout with deception cells
 */
export function buildShiftOnlyColumns(
  ptRows: PTChar[][],
  ctTokens: CTToken[],
  lockedKeys?: Record<string, string>,
  selections?: Record<string, string | null>,
  groupSize: number = 1,
  bracketedIndices?: number[],
): Column[][] {
  void bracketedIndices;
  const filteredRows = ptRows.map(r => r.filter(c => c.ch !== ''));
  const forced: Record<string, string> = {};
  for (const [ch, v] of Object.entries(lockedKeys || {})) if (v) forced[ch] = v;
  for (const [ch, v] of Object.entries(selections || {})) if (v && !forced[ch]) forced[ch] = v as string;
  const hasForced = Object.keys(forced).length > 0;
  const result: Column[][] = [];
  let tokenPtr = 0;
  // Total number of PT cells (flattened) to correctly compute remaining cells
  const totalPTCells = filteredRows.reduce((acc, r) => acc + r.length, 0);
  let processedCells = 0;
  for (let r = 0; r < filteredRows.length; r++) {
    const rowChars = filteredRows[r];
    const rowCols: Column[] = [];
    for (let c = 0; c < rowChars.length; c++) {
      const ch = rowChars[c].ch;
      const want = hasForced ? forced[ch] : undefined;
      if (!want) {
        // Unforced cell. Heuristic: try to take groupSize tokens starting at tokenPtr.
        if (tokenPtr < ctTokens.length) {
          const forcedValues = Object.values(forced);
          const here = seqAt(tokenPtr, ctTokens, groupSize);
          
          // Check if current token is forced for a DIFFERENT character
          // If so, this unforced cell cannot take it - leave empty
          const isForcedForOtherChar = here != null && Object.entries(forced).some(
            ([forcedCh, forcedToken]) => forcedToken === here && forcedCh !== ch
          );
          
          const protectNext = shouldProtectNextGroup(tokenPtr, groupSize, ctTokens, forcedValues, totalPTCells, processedCells);
          
          if (isForcedForOtherChar) {
            // Current token is forced for another character - leave this cell empty
            rowCols.push({ pt: rowChars[c], ct: [] });
          } else if (protectNext) {
            rowCols.push({ pt: rowChars[c], ct: [tokenPtr] });
            tokenPtr += 1;
          } else {
            const groupIndices: number[] = [];
            for (let g = 0; g < groupSize && tokenPtr + g < ctTokens.length; g++) groupIndices.push(tokenPtr + g);
            rowCols.push({ pt: rowChars[c], ct: groupIndices });
            tokenPtr += groupIndices.length;
          }
        } else {
          rowCols.push({ pt: rowChars[c], ct: [] });
        }
      } else {
        // Forced: advance one raw token at a time producing deception cells until the next groupSize tokens concatenated match 'want'
        const need = want;
        let found = false;
        while (tokenPtr < ctTokens.length) {
          const sliceTexts = [] as string[];
          for (let g = 0; g < groupSize && tokenPtr + g < ctTokens.length; g++) sliceTexts.push(ctTokens[tokenPtr + g].text);
          // Try to match the forced value as any prefix of the available slice
          let matchedPrefixLength = 0;
          for (let pref = 1; pref <= sliceTexts.length; pref++) {
            const prefix = sliceTexts.slice(0, pref).join('');
            if (prefix === need) { matchedPrefixLength = pref; break; }
          }
          if (matchedPrefixLength > 0) {
            const groupIndices: number[] = [];
            for (let g = 0; g < matchedPrefixLength; g++) groupIndices.push(tokenPtr + g);
            rowCols.push({ pt: rowChars[c], ct: groupIndices });
            tokenPtr += matchedPrefixLength;
            found = true;
            break;
          } else {
            // deception cell(s) for current tokenPtr
            const forcedValues = Object.values(forced);
            const protectNext = shouldProtectNextGroup(tokenPtr, groupSize, ctTokens, forcedValues, totalPTCells, processedCells);
            if (!protectNext && groupSize > 1 && tokenPtr + groupSize <= ctTokens.length) {
              const groupIndices: number[] = [];
              for (let g = 0; g < groupSize; g++) groupIndices.push(tokenPtr + g);
              rowCols.push({ pt: null, ct: groupIndices, deception: true });
              tokenPtr += groupSize;
            } else {
              rowCols.push({ pt: null, ct: [tokenPtr], deception: true });
              tokenPtr += 1;
            }
          }
        }
        if (!found) {
          // could not find sequence; mark empty deception cell
          rowCols.push({ pt: rowChars[c], ct: [], deception: true });
        }
        // mark this PT cell as processed
        processedCells++;
      }
    }
    if (r === filteredRows.length - 1) {
      // At the very end, collapse remaining raw tokens into deception groups when possible
      while (tokenPtr < ctTokens.length) {
        if (groupSize > 1 && tokenPtr + groupSize <= ctTokens.length) {
          const groupIndices: number[] = [];
          for (let g = 0; g < groupSize; g++) groupIndices.push(tokenPtr + g);
          rowCols.push({ pt: null, ct: groupIndices, deception: true });
          tokenPtr += groupSize;
        } else {
          rowCols.push({ pt: null, ct: [tokenPtr], deception: true });
          tokenPtr++;
        }
      }
    }
    result.push(rowCols);
  }
  return result;
}
