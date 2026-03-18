import type { CTToken } from '../../types/domain';

//for worker: takes the raw list of CT tokens and groups them into logical tokens based on the groupSize (1 for separator mode, >1 for fixed-length mode)
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
