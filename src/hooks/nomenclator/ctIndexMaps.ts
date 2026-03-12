//return a map from effective token indices to original token indices, given the total token count and the list of bracketed token indices
//so we dont see brackened tokens in mapping and insertion logic, but they still exist in the original token list and keep their original indices for reference when inserting new tokens
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
