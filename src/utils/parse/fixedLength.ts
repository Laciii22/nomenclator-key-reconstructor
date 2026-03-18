import type { CTToken } from '../../types/domain';


//utility for fixed-length parsing mode: grouping tokens, tracking which groups are bracketed, and toggling brackets by group text
export function uniqueGroupTexts(tokens: CTToken[], groupSize: number, bracketedIndices: number[]): { text: string; allBracketed: boolean }[] {
  const size = Math.max(1, groupSize);
  const br = new Set(bracketedIndices);
  const meta = new Map<string, { allBracketed: boolean }>();
  const order: string[] = [];

  for (let start = 0; start + size - 1 < tokens.length; start += size) {
    let text = '';
    let groupAllBracketed = true;
    for (let k = 0; k < size; k++) {
      text += tokens[start + k].text;
      if (!br.has(start + k)) groupAllBracketed = false;
    }

    const prev = meta.get(text);
    if (!prev) {
      meta.set(text, { allBracketed: groupAllBracketed });
      order.push(text);
    } else {
      prev.allBracketed = prev.allBracketed && groupAllBracketed;
    }
  }

  return order.map(text => ({ text, allBracketed: meta.get(text)!.allBracketed }));
}

//looks for all groups of tokens matching the given text, and toggles their indices in the bracketedIndices list
export function toggleBracketByGroupText(
  text: string,
  tokens: CTToken[],
  groupSize: number,
  bracketedIndices: number[]
): number[] {
  const size = Math.max(1, groupSize);
  const indicesToToggle: number[] = [];

  for (let start = 0; start + size - 1 < tokens.length; start += size) {
    let groupText = '';
    for (let k = 0; k < size; k++) groupText += tokens[start + k].text;
    if (groupText !== text) continue;
    for (let i = 0; i < size; i++) indicesToToggle.push(start + i);
  }

  if (indicesToToggle.length === 0) return bracketedIndices;

  const set = new Set(bracketedIndices);
  const allAlreadyBracketed = indicesToToggle.every(i => set.has(i));

  if (allAlreadyBracketed) {
    for (const i of indicesToToggle) set.delete(i);
  } else {
    for (const i of indicesToToggle) set.add(i);
  }

  return Array.from(set).sort((a, b) => a - b);
}
