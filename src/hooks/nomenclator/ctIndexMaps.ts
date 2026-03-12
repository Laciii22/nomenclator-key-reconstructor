/**
 * Build a mapping from effective token indices to original token indices.
 *
 * Bracketed (deception) tokens are hidden from mapping/insertion logic,
 * but they still exist in the original token list. This index map lets
 * callers translate effective-space positions back to original positions.
 *
 * @param tokenCount Total number of original tokens
 * @param bracketedIndices Original indices of bracketed/deception tokens
 * @returns Array where `result[effIndex]` is the original token index
 */
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
