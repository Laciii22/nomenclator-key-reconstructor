import type { ZTToken } from '../../components/types';

export function buildLogicalTokens(ztTokens: ZTToken[], groupSize: number): ZTToken[] {
  if (!groupSize || groupSize <= 1) return ztTokens;
  const out: ZTToken[] = [];
  for (let i = 0; i + groupSize - 1 < ztTokens.length; i += groupSize) {
    const slice = ztTokens.slice(i, i + groupSize).map(t => t.text).join('');
    out.push({ id: `lzt_${i}`, text: slice });
  }
  return out;
}

export default buildLogicalTokens;
