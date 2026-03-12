import * as React from 'react';
import type { PTChar, CTToken } from '../types/domain';
import type { Candidate, SelectionMap } from '../utils/analyzer';
import { getExpectedCTIndicesForOT } from '../utils/grouping';

/**
 * Returns the sorted flat array of CT indices occupied by a set of candidates.
 * Uses a Set for O(k) token lookups instead of nested linear scans.
 */
function collectIndices(candidates: Candidate[], ctTokens: CTToken[]): number[] {
  const targetTokens = new Set(candidates.map(c => c.token));
  const indices: number[] = [];
  for (let i = 0; i < ctTokens.length; i++) {
    if (targetTokens.has(ctTokens[i].text)) indices.push(i);
  }
  return indices.sort((a, b) => a - b);
}

export function useAutoPickScoreOneSequential(params: {
  candidatesByChar: Record<string, Candidate[]>;
  ptRows: PTChar[][];
  ctTokens: CTToken[];
  bracketedIndices: number[];
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  keysPerPTMode: 'single' | 'multiple';
}) {
  const { candidatesByChar, ptRows, ctTokens, bracketedIndices, setSelections, keysPerPTMode } = params;

  // --- Single-key: auto-select when exactly one candidate perfectly covers all expected indices ---
  React.useEffect(() => {
    if (keysPerPTMode !== 'single') return;
    if (!Object.keys(candidatesByChar).length) return;

    const expected = getExpectedCTIndicesForOT(ptRows, ctTokens, bracketedIndices);
    const newPicks: Record<string, string> = {};
    for (const [ch, list] of Object.entries(candidatesByChar)) {
      const perfect = list.filter(c => (c.occurrences || 0) > 0 && c.support === c.occurrences);
      if (perfect.length !== 1) continue;
      const token = perfect[0].token;
      const indices = ctTokens.map((t, i) => (t.text === token ? i : -1)).filter(i => i >= 0);
      const exp = expected[ch] || [];
      if (indices.length === exp.length && indices.every((v, i) => v === exp[i])) {
        newPicks[ch] = token;
      }
    }
    if (Object.keys(newPicks).length === 0) return;
    setSelections(prev => {
      const next = { ...prev };
      for (const [ch, token] of Object.entries(newPicks)) {
        if (!next[ch]) next[ch] = token;
      }
      return next;
    });
  }, [bracketedIndices, candidatesByChar, keysPerPTMode, ptRows, setSelections, ctTokens]);

  // --- Multiple-key: auto-select when a set of exclusively-aligned candidates
  //     collectively covers all expected positions with no gaps and no conflicts. ---
  React.useEffect(() => {
    if (keysPerPTMode !== 'multiple') return;
    if (!Object.keys(candidatesByChar).length) return;

    const expected = getExpectedCTIndicesForOT(ptRows, ctTokens, bracketedIndices);
    const newPicks: Record<string, string[]> = {};

    for (const [ch, list] of Object.entries(candidatesByChar)) {
      // "Perfect" homophone: this token appears *only* at positions assigned to this PT char
      const perfect = list.filter(c => (c.occurrences || 0) > 0 && c.support === c.occurrences);
      if (perfect.length === 0) continue;

      const exp = (expected[ch] || []).slice().sort((a, b) => a - b);
      if (exp.length === 0) continue;

      const allIndices = collectIndices(perfect, ctTokens);
      // Only auto-pick if the perfect candidates collectively cover exactly the expected positions
      if (allIndices.length === exp.length && allIndices.every((v, i) => v === exp[i])) {
        newPicks[ch] = perfect.map(c => c.token);
      }
    }

    if (Object.keys(newPicks).length === 0) return;
    setSelections(prev => {
      const next = { ...prev };
      for (const [ch, tokens] of Object.entries(newPicks)) {
        // Only fill in if not yet selected
        if (!next[ch] || (Array.isArray(next[ch]) && (next[ch] as string[]).length === 0)) {
          next[ch] = tokens;
        }
      }
      return next;
    });
  }, [bracketedIndices, candidatesByChar, keysPerPTMode, ptRows, setSelections, ctTokens]);
}
