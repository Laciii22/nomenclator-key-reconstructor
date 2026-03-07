import { buildEffectiveToOriginalIndexMap } from './ctIndexMaps';

type Columns = { pt: { ch: string } | null; ct: number[] }[][];

type ParseMode = 'separator' | 'fixedLength';

export function computeInsertRawCharsAfterPosition(args: {
  positionIndex: number;
  text: string;
  replace?: boolean;
  ctParseMode: ParseMode;
  separator: string;
  ctTokens: { text: string }[];
  bracketedIndices: number[];
  columns: Columns;
}): { nextRaw: string; nextParseMode: ParseMode; nextBracketedIndices: number[] } | null {
  const { positionIndex, text, replace = false, ctParseMode, separator, ctTokens, bracketedIndices, columns } = args;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const isFixed = ctParseMode === 'fixedLength';
  const items = isFixed ? Array.from(trimmed).filter(ch => ch.trim() !== '') : [trimmed];
  if (!items.length) return null;

  // Work against the original token list so deception/bracketed tokens keep their
  // identity and indices even when inserting/replacing visible tokens.
  const originalTokens = ctTokens.map(t => t.text);
  const bracketedSet = new Set(bracketedIndices);
  const effToOrig = buildEffectiveToOriginalIndexMap(ctTokens.length, bracketedIndices);

  // Build flat list of PT-assigned cells (skip deception/null columns)
  const visible: { indices: number[] }[] = [];
  for (const row of columns) for (const col of row) if (col.pt) visible.push({ indices: col.ct });
  const target = visible[positionIndex];

  // Helper: apply "remove these original indices" and "insert items at original index".
  const applyRemoveAndInsert = (removeSet: Set<number>, insertAt: number) => {
    const nextTokens: string[] = [];
    const nextBracketed: number[] = [];
    const insertPos = Math.min(Math.max(0, insertAt), originalTokens.length);

    for (let oldIndex = 0; oldIndex < originalTokens.length; oldIndex++) {
      if (oldIndex === insertPos) {
        nextTokens.push(...items);
      }
      if (removeSet.has(oldIndex)) continue;
      const newIndex = nextTokens.length;
      nextTokens.push(originalTokens[oldIndex]);
      if (bracketedSet.has(oldIndex)) nextBracketed.push(newIndex);
    }
    if (insertPos === originalTokens.length) {
      nextTokens.push(...items);
    }
    return { nextTokens, nextBracketed };
  };

  // When replacing, remove exactly the original indices that are assigned to the
  // target cell (effective-space -> original-space mapping), to avoid disturbing
  // bracketed tokens.
  if (replace && target && target.indices.length) {
    const removeOrig = new Set<number>();
    for (const effIdx of target.indices) {
      const origIdx = effToOrig[effIdx];
      if (typeof origIdx === 'number') removeOrig.add(origIdx);
    }
    if (removeOrig.size) {
      const insertAtOrig = Math.min(...Array.from(removeOrig));
      const { nextTokens, nextBracketed } = applyRemoveAndInsert(removeOrig, insertAtOrig);
      const nextRaw = isFixed ? nextTokens.join('') : nextTokens.join(separator);
      return { nextRaw, nextParseMode: ctParseMode, nextBracketedIndices: nextBracketed };
    }
  }

  // Otherwise, compute insertion point in effective-index space and translate to original.
  // If the target cell has indices: insert after its max.
  // If empty:
  //  - separator: insert at the PT cell position (flat PT index)
  //  - fixedLength: insert before next assigned, else after prev assigned, else at start
  let insertionEffIndex: number;
  if (target && target.indices.length) {
    insertionEffIndex = Math.max(...target.indices) + 1;
  } else if (!isFixed) {
    insertionEffIndex = Math.min(Math.max(0, positionIndex), effToOrig.length);
  } else {
    let nextMin: number | null = null;
    for (let i = positionIndex + 1; i < visible.length; i++) {
      if (visible[i].indices.length) {
        nextMin = Math.min(...visible[i].indices);
        break;
      }
    }
    if (nextMin != null) {
      insertionEffIndex = nextMin;
    } else {
      let prevMax: number | null = null;
      for (let i = positionIndex - 1; i >= 0; i--) {
        if (visible[i].indices.length) {
          prevMax = Math.max(...visible[i].indices);
          break;
        }
      }
      insertionEffIndex = prevMax != null ? prevMax + 1 : 0;
    }
  }

  const safeEff = Math.min(Math.max(0, insertionEffIndex), effToOrig.length);
  const insertAtOrig = safeEff === effToOrig.length ? originalTokens.length : effToOrig[safeEff];
  const { nextTokens, nextBracketed } = applyRemoveAndInsert(new Set(), insertAtOrig);
  const nextRaw = isFixed ? nextTokens.join('') : nextTokens.join(separator);

  return { nextRaw, nextParseMode: ctParseMode, nextBracketedIndices: nextBracketed };
}
