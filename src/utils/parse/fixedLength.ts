import type { ZTToken } from '../../types/domain';

export const DECEPTION_MARKER = (size: number) => '9'.repeat(Math.max(1, size));

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
  const groups = logicalGroups(tokens, groupSize);
  const map = new Map<string, number[]>();
  for (const g of groups) (map.get(g.text) || map.set(g.text, []).get(g.text))?.push(g.start);
  const br = new Set(bracketedIndices);
  const out: { text: string; allBracketed: boolean }[] = [];
  for (const [text, starts] of map.entries()) {
    const allBr = starts.length > 0 && starts.every(s => {
      for (let k = 0; k < Math.max(1, groupSize); k++) { if (!br.has(s + k)) return false; }
      return true;
    });
    out.push({ text, allBracketed: allBr });
  }
  return out;
}

export function toggleBracketByGroupText(text: string, tokens: ZTToken[], groupSize: number, bracketedIndices: number[]): number[] {
  const size = Math.max(1, groupSize);
  const indicesToToggle: number[] = [];
  const groups = logicalGroups(tokens, size);
  for (const g of groups) {
    if (g.text === text) {
      for (let i = 0; i < size; i++) indicesToToggle.push(g.start + i);
    }
  }
  if (!indicesToToggle.length) return bracketedIndices;
  const set = new Set(bracketedIndices);
  const all = indicesToToggle.every(i => set.has(i));
  if (all) indicesToToggle.forEach(i => set.delete(i)); else indicesToToggle.forEach(i => set.add(i));
  return Array.from(set).sort((a, b) => a - b);
}
