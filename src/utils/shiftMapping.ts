import type { OTChar } from '../types/domain';
import type { Column } from '../components/types';
import type { ZTToken } from '../types/domain';

// Build shift-only columns with deception (!) cells without reordering original token indices.
// Forced map combines lockedKeys + selections (selections do not overwrite locks).
export function buildShiftOnlyColumns(
  otRows: OTChar[][],
  ztTokens: ZTToken[],
  lockedKeys?: Record<string, string>,
  selections?: Record<string, string | null>
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
        if (tokenPtr < ztTokens.length) {
          rowCols.push({ ot: rowChars[c], zt: [tokenPtr] });
          tokenPtr++;
        } else {
          rowCols.push({ ot: rowChars[c], zt: [] });
        }
      } else {
        while (tokenPtr < ztTokens.length && ztTokens[tokenPtr].text !== want) {
          rowCols.push({ ot: null, zt: [tokenPtr], deception: true });
          tokenPtr++;
        }
        if (tokenPtr < ztTokens.length) {
          rowCols.push({ ot: rowChars[c], zt: [tokenPtr] });
          tokenPtr++;
        } else {
          rowCols.push({ ot: rowChars[c], zt: [], deception: true });
        }
      }
    }
    if (r === filteredRows.length - 1) {
      while (tokenPtr < ztTokens.length) {
        rowCols.push({ ot: null, zt: [tokenPtr], deception: true });
        tokenPtr++;
      }
    }
    result.push(rowCols);
  }
  return result;
}
