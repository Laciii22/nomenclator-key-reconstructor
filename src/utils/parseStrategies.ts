import type { ZTToken } from '../types/domain';

export type ParseMode = 'separator' | 'fixedLength';

// Determine group size based on parse mode 
export function getGroupSize(mode: ParseMode, fixedLength?: number) {
  return mode === 'fixedLength' ? (fixedLength && fixedLength > 0 ? fixedLength : 1) : 1;
}


// Build occurrence map of token text -> array of starting indices in effectiveZtTokens
export function buildOccMap(effectiveZtTokens: ZTToken[], groupSize: number) {
  const occMap: Record<string, number[]> = {};
  if (groupSize === 1) {
    effectiveZtTokens.forEach((t, i) => { (occMap[t.text] ||= []).push(i); });
  } else {
    for (let i = 0; i + groupSize - 1 < effectiveZtTokens.length; i += groupSize) {
      const grp = effectiveZtTokens.slice(i, i + groupSize).map(x => x.text).join('');
      (occMap[grp] ||= []).push(i);
    }
  }
  return occMap;
}
