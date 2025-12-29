import { buildOccMap } from '../../utils/parseStrategies';
import type { ZTToken, OTChar } from '../../types/domain';
import type { Column } from '../types';

export type CandidateOption = {
  token: string;
  disabled: boolean;
  title?: string;
  label: string;
  score: number;
};

export function computeFlatIndexForChar(otRows: OTChar[][], ch: string) {
  let idx2 = 0;
  for (const row of otRows) {
    for (const cell of row) {
      if (cell.ch !== '') {
        if (cell.ch === ch) return idx2;
        idx2++;
      }
    }
  }
  return -1;
}

export function buildCandidateOptions(params: {
  c: { token: string; score: number; length?: number };
  idx: number;
  ch: string;
  otRows: OTChar[][];
  effectiveZtTokens: ZTToken[];
  groupSize: number;
  reservedTokens: Set<string>;
  selectionVal: string | null | undefined;
  lockedVal: string | undefined;
  sharedColumns: Column[][];
}): CandidateOption {
  const { c, ch, otRows, effectiveZtTokens, groupSize, reservedTokens, selectionVal, lockedVal, sharedColumns } = params;
  const takenByOther = reservedTokens.has(c.token) && selectionVal !== c.token && lockedVal !== c.token;
  const cellFlatIndex = computeFlatIndexForChar(otRows, ch);

  const occMap = buildOccMap(effectiveZtTokens, groupSize);
  const occ = occMap[c.token] || [];

  // Count deception tokens before target
  const flatColumns: { otCh: string | null; indices: number[] }[] = [];
  for (const row of sharedColumns) for (const col of row) flatColumns.push({ otCh: col.ot ? col.ot.ch : null, indices: (col.zt || []) as number[] });
  let deceptionTotal = 0;
  for (let i = 0; i < flatColumns.length; i++) if (flatColumns[i].otCh == null) deceptionTotal += (flatColumns[i].indices || []).length;

  let orderInvalid = false;
  if (occ.length === 0) {
    // Token does not exist in the logical ZT stream (e.g. manually implied group
    // like "33" when only "11" and "23" physically occur). Allow it as a
    // manual override and don't enforce ordering in this case.
    orderInvalid = false;
  } else if (groupSize === 1) {
    const expectedStart = cellFlatIndex;
    orderInvalid = !(cellFlatIndex >= 0 && occ.some(i => Math.abs(i - expectedStart) <= deceptionTotal));
  } else {
    const expectedStart = cellFlatIndex * groupSize;
    orderInvalid = !(cellFlatIndex >= 0 && occ.some(i => Math.abs(i - expectedStart) <= deceptionTotal));
  }

  const disabled = takenByOther || orderInvalid;
  const scoreStr = ` (score: ${c.score.toFixed(2)})`;
  let title: string | undefined;
  if (takenByOther) title = 'This token is already used for another character';
  else if (orderInvalid) title = groupSize === 1 ? 'Token must start at index 0 for the first OT character' : `Token must start at index ${cellFlatIndex * groupSize} for position ${cellFlatIndex}`;

  return {
    token: c.token,
    disabled,
    title,
    label: `${c.token}${scoreStr}${lockedVal === c.token ? ' (locked)' : ''}`,
    score: c.score,
  };
}
