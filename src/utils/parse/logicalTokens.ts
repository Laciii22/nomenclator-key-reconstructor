import type { ZTToken } from '../../types/domain';

export function buildLogicalTokens(ztTokens: ZTToken[], groupSize: number): ZTToken[] {
  if (!groupSize || groupSize <= 1) return ztTokens;
  const out: ZTToken[] = [];
  // Group tokens in non-overlapping chunks up to `groupSize`.
  // Include a final shorter chunk if tokens.length is not divisible by groupSize.
  for (let i = 0; i < ztTokens.length; i += groupSize) {
    const slice = ztTokens.slice(i, i + groupSize).map(t => t.text).join('');
    out.push({ id: `lzt_${i}`, text: slice });
  }
  return out;
}

export default buildLogicalTokens;
