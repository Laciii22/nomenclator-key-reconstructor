/**
 * Shift-based column mapping for fixed-length mode.
 * 
 * Builds the OT→ZT allocation grid by respecting locked/selected mappings
 * and creating deception cells when necessary to align forced groups.
 * 
 * The algorithm:
 * 1. Iterates through OT cells in row-major order
 * 2. For unlocked cells: allocates groupSize tokens greedily
 * 3. For locked/selected cells: scans forward to find matching token group,
 *    creating deception cells for skipped tokens
 * 4. Handles edge cases like protecting upcoming forced groups
 */

import type { OTChar } from '../types/domain';
import type { Column } from '../components/types';
import type { ZTToken } from '../types/domain';

/**
 * Build allocation columns for fixed-length mode with lock/selection awareness.
 * 
 * @param otRows OT character rows
 * @param ztTokens Raw ZT tokens (individual characters in fixed-length mode)
 * @param lockedKeys User-confirmed OT→ZT mappings
 * @param selections Current manual selections
 * @param groupSize Size of token groups
 * @returns Column layout with deception cells
 */
export function buildShiftOnlyColumns(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  lockedKeys?: Record<string, string>,
  selections?: Record<string, string | null>,
  groupSize: number = 1,
): Column[][] {
  const filteredRows = otRows.map(r => r.filter(c => c.ch !== ''));
  const forced: Record<string, string> = {};
  for (const [ch, v] of Object.entries(lockedKeys || {})) if (v) forced[ch] = v;
  for (const [ch, v] of Object.entries(selections || {})) if (v && !forced[ch]) forced[ch] = v as string;
  const hasForced = Object.keys(forced).length > 0;
  const result: Column[][] = [];
  let tokenPtr = 0;
  for (let r = 0; r < filteredRows.length; r++) {
    const rowChars = filteredRows[r];
    const rowCols: Column[] = [];
    for (let c = 0; c < rowChars.length; c++) {
      const ch = rowChars[c].ch;
      const want = hasForced ? forced[ch] : undefined;
      if (!want) {
        // Unforced cell. Heuristic: try to take groupSize tokens starting at tokenPtr.
        if (tokenPtr < ztTokens.length) {
          const forcedValues = Object.values(forced).filter(v => v.length === groupSize);
          const seqAt = (start: number) => {
            if (start + groupSize - 1 >= ztTokens.length) return null;
            let s = '';
            for (let g = 0; g < groupSize; g++) s += ztTokens[start + g].text;
            return s;
          };
          const here = seqAt(tokenPtr);
          const next = seqAt(tokenPtr + 1);
          
          // Check if current token is forced for a DIFFERENT character
          // If so, this unforced cell cannot take it - leave empty
          const isForcedForOtherChar = here != null && Object.entries(forced).some(
            ([forcedCh, forcedToken]) => forcedToken === here && forcedCh !== ch
          );
          
          // Decide whether to protect next forced group by taking only one token here.
          // Additionally ensure taking one token won't leave too many remaining tokens
          // that cannot be accommodated by remaining OT cells (would create leftover tokens).
          const remainingOTCells = rowChars.length - (c + 1);
          const remainingTokensIfTakeOne = ztTokens.length - (tokenPtr + 1);
          const canAccommodateAfterOne = remainingTokensIfTakeOne <= remainingOTCells * groupSize;
          const shouldProtectNext = groupSize > 1 && here !== next && next != null && forcedValues.includes(next as string) && !forcedValues.includes(here as string) && canAccommodateAfterOne;
          
          if (isForcedForOtherChar) {
            // Current token is forced for another character - leave this cell empty
            rowCols.push({ ot: rowChars[c], zt: [] });
          } else if (shouldProtectNext) {
            rowCols.push({ ot: rowChars[c], zt: [tokenPtr] });
            tokenPtr += 1;
          } else {
            const groupIndices: number[] = [];
            for (let g = 0; g < groupSize && tokenPtr + g < ztTokens.length; g++) groupIndices.push(tokenPtr + g);
            rowCols.push({ ot: rowChars[c], zt: groupIndices });
            tokenPtr += groupIndices.length;
          }
        } else {
          rowCols.push({ ot: rowChars[c], zt: [] });
        }
      } else {
        // Forced: advance one raw token at a time producing deception cells until the next groupSize tokens concatenated match 'want'
        const need = want;
        let found = false;
        while (tokenPtr < ztTokens.length) {
          const sliceTexts = [] as string[];
          for (let g = 0; g < groupSize && tokenPtr + g < ztTokens.length; g++) sliceTexts.push(ztTokens[tokenPtr + g].text);
          const candidate = sliceTexts.join('');
          if (sliceTexts.length === groupSize && candidate === need) {
            const groupIndices: number[] = [];
            for (let g = 0; g < groupSize; g++) groupIndices.push(tokenPtr + g);
            rowCols.push({ ot: rowChars[c], zt: groupIndices });
            tokenPtr += groupSize;
            found = true;
            break;
              } else {
                // deception cell(s) for current tokenPtr
                const forcedValues = Object.values(forced).filter(v => v.length === groupSize);
                const seqAt = (start: number) => {
                  if (start + groupSize - 1 >= ztTokens.length) return null;
                  let s = '';
                  for (let g = 0; g < groupSize; g++) s += ztTokens[start + g].text;
                  return s;
                };
                const here = seqAt(tokenPtr);
                const next = seqAt(tokenPtr + 1);
                const remainingOTCells = rowChars.length - (c + 1);
                const remainingTokensIfTakeOne = ztTokens.length - (tokenPtr + 1);
                const canAccommodateAfterOne = remainingTokensIfTakeOne <= remainingOTCells * groupSize;
                const shouldProtectNext = groupSize > 1 && here !== next && next != null && forcedValues.includes(next as string) && !forcedValues.includes(here as string) && canAccommodateAfterOne;
                if (!shouldProtectNext && groupSize > 1 && tokenPtr + groupSize <= ztTokens.length) {
                const groupIndices: number[] = [];
                for (let g = 0; g < groupSize; g++) groupIndices.push(tokenPtr + g);
                rowCols.push({ ot: null, zt: groupIndices, deception: true });
                tokenPtr += groupSize;
              } else {
                rowCols.push({ ot: null, zt: [tokenPtr], deception: true });
                tokenPtr += 1;
              }
          }
        }
        if (!found) {
          // could not find sequence; mark empty deception cell
          rowCols.push({ ot: rowChars[c], zt: [], deception: true });
        }
      }
    }
    if (r === filteredRows.length - 1) {
      // At the very end, collapse remaining raw tokens into deception groups when possible
      while (tokenPtr < ztTokens.length) {
        if (groupSize > 1 && tokenPtr + groupSize <= ztTokens.length) {
          const groupIndices: number[] = [];
          for (let g = 0; g < groupSize; g++) groupIndices.push(tokenPtr + g);
          rowCols.push({ ot: null, zt: groupIndices, deception: true });
          tokenPtr += groupSize;
        } else {
          rowCols.push({ ot: null, zt: [tokenPtr], deception: true });
          tokenPtr++;
        }
      }
    }
    result.push(rowCols);
  }
  return result;
}
