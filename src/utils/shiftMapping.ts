import type { OTChar } from '../types/domain';
import type { Column } from '../components/types';
import type { ZTToken } from '../types/domain';

// Build shift-only columns with deception (!) cells without reordering original token indices.
// Forced map combines lockedKeys + selections (selections do not overwrite locks).
export function buildShiftOnlyColumns(
  otRows: OTChar[][],
  ztTokens: ZTToken[], // raw tokens (single chars when fixedLength mode)
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
        // Unforced cell. Heuristika: ak posunutie o celý groupSize by rozbilo budúcu nútenú sekvenciu (forced value)
        // ktorá začína na tokenPtr+1 (ale nie na tokenPtr), odober len jeden token.
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
          const shouldProtectNext = groupSize > 1 && here !== next && next != null && forcedValues.includes(next as string) && !forcedValues.includes(here as string);
          if (shouldProtectNext) {
            // Vezmi len jeden token, aby ostala budúca skupina nedotknutá
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
              const shouldProtectNext = groupSize > 1 && here !== next && next != null && forcedValues.includes(next as string) && !forcedValues.includes(here as string);
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
