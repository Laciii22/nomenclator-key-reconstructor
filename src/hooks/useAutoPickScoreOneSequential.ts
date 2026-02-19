import * as React from 'react';
import type { OTChar, ZTToken } from '../types/domain';
import type { Candidate, SelectionMap } from '../utils/analyzer';
import { getExpectedZTIndicesForOT } from '../utils/grouping';

export function useAutoPickScoreOneSequential(params: {
  candidatesByChar: Record<string, Candidate[]>;
  otRows: OTChar[][];
  ztTokens: ZTToken[];
  bracketedIndices: number[];
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
}) {
  const { candidatesByChar, otRows, ztTokens, bracketedIndices, setSelections } = params;

  // Auto-select candidates with score==1 matching sequential expected indices
  React.useEffect(() => {
    if (!Object.keys(candidatesByChar).length) return;
    const expected = getExpectedZTIndicesForOT(otRows, ztTokens, bracketedIndices);
    setSelections(prev => {
      const next = { ...prev };
      for (const [ch, list] of Object.entries(candidatesByChar)) {
        if (next[ch]) continue;
        const score1 = list.filter(c => c.score === 1);
        if (score1.length !== 1) continue;
        const token = score1[0].token;
        const indices = ztTokens.map((t, i) => (t.text === token ? i : -1)).filter(i => i >= 0);
        const exp = expected[ch] || [];
        if (indices.length === exp.length && indices.every((v, i) => v === exp[i])) next[ch] = token;
      }
      return next;
    });
  }, [bracketedIndices, candidatesByChar, otRows, setSelections, ztTokens]);
}
