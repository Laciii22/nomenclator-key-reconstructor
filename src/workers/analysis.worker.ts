/**
 * Web Worker for frequency analysis.
 * Offloads heavy computation from main thread to prevent UI blocking.
 */

import type { PTChar, CTToken } from '../types/domain';
import { analyze } from '../utils/analyzer';
import type { Candidate } from '../utils/analyzer';
import { buildFixedModeGridContext, fixedModeScore, separatorModeScore } from '../utils/analyzer';

type ColumnLike = { pt: { ch: string } | null; ct: number[] }[][];

function sortCandidates(map: Record<string, Candidate[]>): Record<string, Candidate[]> {
  const sorted: Record<string, Candidate[]> = {};
  for (const [ch, list] of Object.entries(map)) {
    sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
  }
  return sorted;
}

function scoreCandidates(params: {
  candidatesByChar: Record<string, Candidate[]>;
  ptRows: PTChar[][];
  ctParseMode: 'separator' | 'fixedLength';
  fixedLength: number;
  effectiveCtTokens: CTToken[];
  columns: ColumnLike;
  keysPerPTMode: 'single' | 'multiple';
  gridTokenSet: string[];
}): Record<string, Candidate[]> {
  const { candidatesByChar, ptRows, ctParseMode, fixedLength, effectiveCtTokens, columns, keysPerPTMode, gridTokenSet } = params;

  if (ctParseMode !== 'fixedLength') {
    const out: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(candidatesByChar)) {
      out[ch] = list.map(c => {
        const scored = separatorModeScore({ token: c.token, ptChar: ch, ptRows, effectiveCtTokens });
        return { ...c, support: scored.support, occurrences: scored.occurrences, score: scored.score };
      });
    }
    return sortCandidates(out);
  }

  const gs = fixedLength || 1;
  const tokenSet = new Set<string>(gridTokenSet);
  const gridCtx = buildFixedModeGridContext(columns, effectiveCtTokens);
  const out: Record<string, Candidate[]> = {};

  for (const [ch, list] of Object.entries(candidatesByChar)) {
    const scored = list.map(c => {
      const next = fixedModeScore({ token: c.token, ptChar: ch, columns, effectiveCtTokens, groupSize: gs, keysPerPTMode, _gridCtx: gridCtx });
      return { ...c, support: next.support, occurrences: next.occurrences, score: next.score };
    });
    out[ch] = scored.filter(c => c.score > 0 || tokenSet.has(c.token));
  }

  return sortCandidates(out);
}

export interface AnalysisWorkerRequest {
  type: 'analyze' | 'score-candidates';
  requestId: number;
  ptRows?: PTChar[][];
  ctTokens?: CTToken[];
  rowGroups?: number[][];
  keysPerPTMode?: 'single' | 'multiple';
  groupSize?: number;
  lockedKeys?: Record<string, string | string[]>;
  candidatesByChar?: Record<string, Candidate[]>;
  ctParseMode?: 'separator' | 'fixedLength';
  fixedLength?: number;
  effectiveCtTokens?: CTToken[];
  columns?: ColumnLike;
  gridTokenSet?: string[];
}

export interface AnalysisWorkerResponse {
  type: 'analyze-result' | 'score-candidates-result';
  requestId: number;
  candidatesByChar: Record<string, Candidate[]>;
}

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { type, requestId } = e.data;
  
  if (type === 'analyze') {
    const { ptRows, ctTokens, rowGroups, keysPerPTMode, groupSize, lockedKeys } = e.data;
    if (!ptRows || !ctTokens || !rowGroups || !keysPerPTMode || !groupSize) return;

    const result = analyze(ptRows, ctTokens, rowGroups, { keysPerPTMode, groupSize }, lockedKeys);
    
    const response: AnalysisWorkerResponse = {
      type: 'analyze-result',
      requestId,
      candidatesByChar: result.candidatesByChar,
    };
    
    self.postMessage(response);
    return;
  }

  if (type === 'score-candidates') {
    const {
      candidatesByChar,
      ptRows,
      ctParseMode,
      fixedLength,
      effectiveCtTokens,
      columns,
      keysPerPTMode,
      gridTokenSet,
    } = e.data;

    if (!candidatesByChar || !ptRows || !ctParseMode || !effectiveCtTokens || !columns || !keysPerPTMode) return;

    const scored = scoreCandidates({
      candidatesByChar,
      ptRows,
      ctParseMode,
      fixedLength: fixedLength || 1,
      effectiveCtTokens,
      columns,
      keysPerPTMode,
      gridTokenSet: gridTokenSet || [],
    });

    const response: AnalysisWorkerResponse = {
      type: 'score-candidates-result',
      requestId,
      candidatesByChar: scored,
    };
    self.postMessage(response);
  }
};
