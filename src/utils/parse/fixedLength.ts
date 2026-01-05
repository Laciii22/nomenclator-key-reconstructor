import type { ZTToken } from '../../types/domain';



export function logicalGroups(tokens: ZTToken[], groupSize: number): { text: string; start: number }[] {
  const size = Math.max(1, groupSize);
  const out: { text: string; start: number }[] = [];
  for (let i = 0; i + size - 1 < tokens.length; i += size) {
    const t = tokens.slice(i, i + size).map(x => x.text).join('');
    out.push({ text: t, start: i });
  }
  return out;
}

export function uniqueGroupTexts(tokens: ZTToken[], groupSize: number, bracketedIndices: number[]): { text: string; allBracketed: boolean }[] {
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

export function toggleBracketByGroupText(text: string, tokens: ZTToken[], groupSize: number, bracketedIndices: number[]): number[] {
  const size = Math.max(1, groupSize);
  const indicesToToggle: number[] = [];

  for (let start = 0; start + size - 1 < tokens.length; start += size) {
    let groupText = '';
    for (let k = 0; k < size; k++) groupText += tokens[start + k].text;
    if (groupText !== text) continue;
    for (let i = 0; i < size; i++) indicesToToggle.push(start + i);
  }

  if (!indicesToToggle.length) return bracketedIndices;
  const set = new Set(bracketedIndices);
  const all = indicesToToggle.every(i => set.has(i));
  if (all) indicesToToggle.forEach(i => set.delete(i)); else indicesToToggle.forEach(i => set.add(i));
  return Array.from(set).sort((a, b) => a - b);
}
