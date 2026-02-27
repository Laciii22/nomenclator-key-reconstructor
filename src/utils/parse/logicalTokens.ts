import type { CTToken } from '../../types/domain';

export function buildLogicalTokens(ctTokens: CTToken[], groupSize: number): CTToken[] {
  if (!groupSize || groupSize <= 1) return ctTokens;
  const out: CTToken[] = [];
  // Group tokens in non-overlapping chunks up to `groupSize`.
  // Include a final shorter chunk if tokens.length is not divisible by groupSize.
  for (let i = 0; i < ctTokens.length; i += groupSize) {
    const slice = ctTokens.slice(i, i + groupSize).map(t => t.text).join('');
    out.push({ id: `lzt_${i}`, text: slice });
  }
  return out;
}

export default buildLogicalTokens;
