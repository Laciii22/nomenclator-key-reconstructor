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

/** Build an array of consecutive indices [start, start+1, ..., start+count-1]. */
function indicesFrom(start: number, count: number, max: number): number[] {
  const indices: number[] = [];
  for (let g = 0; g < count && start + g < max; g++) indices.push(start + g);
  return indices;
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

/** Merge locked keys and selections into a single forced-mapping dictionary. */
function buildForcedMap(
  lockedKeys?: Record<string, string>,
  selections?: Record<string, string | null>,
): Record<string, string> {
  const forced: Record<string, string> = {};
  for (const [ch, v] of Object.entries(lockedKeys || {})) if (v) forced[ch] = v;
  for (const [ch, v] of Object.entries(selections || {})) if (v && !forced[ch]) forced[ch] = v as string;
  return forced;
}

/** Allocate tokens for an unforced cell (no lock/selection). */
function allocateUnforcedCell(
  ptChar: PTChar,
  ch: string,
  tokenPtr: number,
  groupSize: number,
  ctTokens: CTToken[],
  forced: Record<string, string>,
  totalPTCells: number,
  processedCells: number,
): { column: Column; consumed: number } {
  if (tokenPtr >= ctTokens.length) {
    return { column: { pt: ptChar, ct: [] }, consumed: 0 };
  }

  const forcedValues = Object.values(forced);
  const here = seqAt(tokenPtr, ctTokens, groupSize);

  // Current token is forced for a DIFFERENT character — leave this cell empty
  const isForcedForOtherChar = here != null && Object.entries(forced).some(
    ([forcedCh, forcedToken]) => forcedToken === here && forcedCh !== ch
  );
  if (isForcedForOtherChar) {
    return { column: { pt: ptChar, ct: [] }, consumed: 0 };
  }

  const protectNext = shouldProtectNextGroup(
    tokenPtr, groupSize, ctTokens, forcedValues, totalPTCells, processedCells,
  );
  if (protectNext) {
    return { column: { pt: ptChar, ct: [tokenPtr] }, consumed: 1 };
  }

  const groupIndices = indicesFrom(tokenPtr, groupSize, ctTokens.length);
  return { column: { pt: ptChar, ct: groupIndices }, consumed: groupIndices.length };
}

/** Scan forward to find a forced token match, emitting deception cells for skipped tokens. */
function allocateForcedCell(
  ptChar: PTChar,
  need: string,
  tokenPtr: number,
  groupSize: number,
  ctTokens: CTToken[],
  forced: Record<string, string>,
  totalPTCells: number,
  processedCells: number,
): { columns: Column[]; consumed: number } {
  const cols: Column[] = [];
  let ptr = tokenPtr;

  while (ptr < ctTokens.length) {
    // Build candidate slice of up to groupSize tokens
    const sliceTexts: string[] = [];
    for (let g = 0; g < groupSize && ptr + g < ctTokens.length; g++) {
      sliceTexts.push(ctTokens[ptr + g].text);
    }

    // Try to match the forced value as any prefix of the available slice
    let matchLen = 0;
    for (let pref = 1; pref <= sliceTexts.length; pref++) {
      if (sliceTexts.slice(0, pref).join('') === need) { matchLen = pref; break; }
    }

    if (matchLen > 0) {
      // Found the forced token — emit the PT cell
      cols.push({ pt: ptChar, ct: indicesFrom(ptr, matchLen, ctTokens.length) });
      return { columns: cols, consumed: ptr + matchLen - tokenPtr };
    }

    // Not a match — emit a deception cell and advance
    const forcedValues = Object.values(forced);
    const protectNext = shouldProtectNextGroup(
      ptr, groupSize, ctTokens, forcedValues, totalPTCells, processedCells,
    );
    if (!protectNext && groupSize > 1 && ptr + groupSize <= ctTokens.length) {
      cols.push({ pt: null, ct: indicesFrom(ptr, groupSize, ctTokens.length), deception: true });
      ptr += groupSize;
    } else {
      cols.push({ pt: null, ct: [ptr], deception: true });
      ptr += 1;
    }
  }

  // Could not find forced token — mark as empty deception
  cols.push({ pt: ptChar, ct: [], deception: true });
  return { columns: cols, consumed: ptr - tokenPtr };
}

/** Append any remaining unallocated tokens as deception cells to a row. */
function appendTrailingDeception(
  rowCols: Column[],
  tokenPtr: number,
  groupSize: number,
  ctTokens: CTToken[],
): number {
  let ptr = tokenPtr;
  while (ptr < ctTokens.length) {
    if (groupSize > 1 && ptr + groupSize <= ctTokens.length) {
      rowCols.push({ pt: null, ct: indicesFrom(ptr, groupSize, ctTokens.length), deception: true });
      ptr += groupSize;
    } else {
      rowCols.push({ pt: null, ct: [ptr], deception: true });
      ptr++;
    }
  }
  return ptr;
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
  const forced = buildForcedMap(lockedKeys, selections);
  const hasForced = Object.keys(forced).length > 0;
  const totalPTCells = filteredRows.reduce((acc, r) => acc + r.length, 0);

  const result: Column[][] = [];
  let tokenPtr = 0;
  let processedCells = 0;

  for (let r = 0; r < filteredRows.length; r++) {
    const rowChars = filteredRows[r];
    const rowCols: Column[] = [];

    for (let c = 0; c < rowChars.length; c++) {
      const ch = rowChars[c].ch;
      const want = hasForced ? forced[ch] : undefined;

      if (!want) {
        const { column, consumed } = allocateUnforcedCell(
          rowChars[c], ch, tokenPtr, groupSize, ctTokens,
          forced, totalPTCells, processedCells,
        );
        rowCols.push(column);
        tokenPtr += consumed;
      } else {
        const { columns, consumed } = allocateForcedCell(
          rowChars[c], want, tokenPtr, groupSize, ctTokens,
          forced, totalPTCells, processedCells,
        );
        rowCols.push(...columns);
        tokenPtr += consumed;
        processedCells++;
      }
    }

    // Append trailing deception cells on the last row
    if (r === filteredRows.length - 1) {
      tokenPtr = appendTrailingDeception(rowCols, tokenPtr, groupSize, ctTokens);
    }

    result.push(rowCols);
  }

  return result;
}
