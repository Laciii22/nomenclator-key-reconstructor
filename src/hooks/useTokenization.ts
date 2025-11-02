import { useMemo } from 'react';
import type { OTChar, ZTToken } from '../types/domain';


/**
 * Making tokenization from inputs for mapping table
 * @param otRaw Raw string for OT characters.
 * @param ztRaw Raw string for ZT tokens.
 * @param cols Number of columns for OT layout.
 * @returns Object containing otChars, ztTokens, and otRows.
 */

export function useTokenization(otRaw: string, ztRaw: string, cols = 12) {
  const otChars = useMemo<OTChar[]>(() => {
    const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
    return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
  }, [otRaw]);

  const ztTokens = useMemo<ZTToken[]>(() => {
    const s = ztRaw.trim();
    const parts = /\s/.test(s) ? s.split(/\s+/).filter(Boolean) : Array.from(s);
    return parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
  }, [ztRaw]);

  const otRows = useMemo<OTChar[][]>(() => {
    const rows: OTChar[][] = [];
    for (let i = 0; i < otChars.length; i += cols) {
      rows.push(otChars.slice(i, i + cols));
    }
    return rows.length ? rows : [[]];
  }, [otChars, cols]);

  return { otChars, ztTokens, otRows };
}
