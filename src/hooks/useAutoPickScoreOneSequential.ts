import * as React from 'react';
import type { PTChar, CTToken } from '../types/domain';
import type { Candidate, SelectionMap } from '../utils/analyzer';
import { getExpectedCTIndicesForOT } from '../utils/grouping';

export function useAutoPickScoreOneSequential(params: {
  candidatesByChar: Record<string, Candidate[]>;
  ptRows: PTChar[][];
  ctTokens: CTToken[];
  bracketedIndices: number[];
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  keysPerPTMode: 'single' | 'multiple';
}) {
  const { candidatesByChar, ptRows, ctTokens, bracketedIndices, setSelections, keysPerPTMode } = params;

  // Auto-select candidates with score==1 matching sequential expected indices.
  // Disabled in multi-key (homophones) mode — the user selects homophones manually.
  React.useEffect(() => {
    if (keysPerPTMode === 'multiple') return;
    if (!Object.keys(candidatesByChar).length) return;
    const expected = getExpectedCTIndicesForOT(ptRows, ctTokens, bracketedIndices);
    setSelections(prev => {
      const next = { ...prev };
      for (const [ch, list] of Object.entries(candidatesByChar)) {
        if (next[ch]) continue;
        // Consider a candidate "perfect" only if its support equals occurrences
        const perfect = list.filter(c => (c.occurrences || 0) > 0 && c.support === c.occurrences);
        if (perfect.length !== 1) continue;
        const token = perfect[0].token;
        const indices = ctTokens.map((t, i) => (t.text === token ? i : -1)).filter(i => i >= 0);
        const exp = expected[ch] || [];
        if (indices.length === exp.length && indices.every((v, i) => v === exp[i])) next[ch] = token;
      }
      return next;
    });
  }, [bracketedIndices, candidatesByChar, keysPerPTMode, ptRows, setSelections, ctTokens]);
}
