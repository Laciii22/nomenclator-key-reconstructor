import type { OTChar, ZTToken } from '../types/domain';

// Sequential expected ZT indices per OT char (skips bracketed tokens)
export function getExpectedZTIndicesForOT(
  otRowsLocal: OTChar[][],
  ztTokensLocal: ZTToken[],
  bracketed: number[]
): Record<string, number[]> {
  const flat: string[] = [];
  for (const row of otRowsLocal) for (const cell of row) if (cell.ch !== '') flat.push(cell.ch);
  const br = new Set(bracketed);
  const map: Record<string, number[]> = {};
  let ptr = 0;
  for (let i = 0; i < ztTokensLocal.length && ptr < flat.length; i++) {
    if (br.has(i)) continue;
    const ch = flat[ptr];
    (map[ch] ||= []).push(i);
    ptr++;
  }
  return map;
}
