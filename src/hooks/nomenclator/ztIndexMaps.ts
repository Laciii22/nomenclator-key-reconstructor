export function buildEffectiveToOriginalIndexMap(
  tokenCount: number,
  bracketedIndices: readonly number[]
): number[] {
  const bracketedSet = new Set<number>(bracketedIndices);
  const effToOrig: number[] = [];
  for (let i = 0; i < tokenCount; i++) {
    if (!bracketedSet.has(i)) effToOrig.push(i);
  }
  return effToOrig;
}
