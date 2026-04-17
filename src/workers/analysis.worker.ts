/**
 * Web Worker for frequency analysis.
 * Offloads heavy computation from main thread to prevent UI blocking.
 */

import type { PTChar, CTToken } from '../types/domain';
import { analyzeIncremental } from '../utils/analyzer';
import type { Candidate } from '../utils/analyzer';
import { buildFixedModeGridContext, fixedModeScore, separatorModeScore } from '../utils/analyzer';

type ColumnLike = { pt: { ch: string } | null; ct: number[] }[][];
const SCORE_YIELD_EVERY = 200;

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function sortCandidates(map: Record<string, Candidate[]>): Record<string, Candidate[]> {
  const sorted: Record<string, Candidate[]> = {};
  for (const [ch, list] of Object.entries(map)) {
    sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
  }
  return sorted;
}

async function scoreCandidates(params: {
  candidatesByChar: Record<string, Candidate[]>;
  ptRows: PTChar[][];
  ctParseMode: 'separator' | 'fixedLength';
  fixedLength: number;
  effectiveCtTokens: CTToken[];
  columns: ColumnLike;
  keysPerPTMode: 'single' | 'multiple';
  gridTokenSet: string[];
}): Promise<Record<string, Candidate[]>> {
  const { candidatesByChar, ptRows, ctParseMode, fixedLength, effectiveCtTokens, columns, keysPerPTMode, gridTokenSet } = params;

  if (ctParseMode !== 'fixedLength') {
    const out: Record<string, Candidate[]> = {};
    let processed = 0;
    for (const [ch, list] of Object.entries(candidatesByChar)) {
      const scoredList: Candidate[] = [];
      for (const c of list) {
        const scored = separatorModeScore({ token: c.token, ptChar: ch, ptRows, effectiveCtTokens });
        scoredList.push({ ...c, support: scored.support, occurrences: scored.occurrences, score: scored.score });
        processed++;
        if (processed % SCORE_YIELD_EVERY === 0) await yieldToEventLoop();
      }
      out[ch] = scoredList;
    }
    return sortCandidates(out);
  }

  const gs = fixedLength || 1;
  const tokenSet = new Set<string>(gridTokenSet);
  const gridCtx = buildFixedModeGridContext(columns, effectiveCtTokens);
  const out: Record<string, Candidate[]> = {};
  let processed = 0;

  for (const [ch, list] of Object.entries(candidatesByChar)) {
    const scored: Candidate[] = [];
    for (const c of list) {
      const next = fixedModeScore({ token: c.token, ptChar: ch, columns, effectiveCtTokens, groupSize: gs, keysPerPTMode, _gridCtx: gridCtx });
      scored.push({ ...c, support: next.support, occurrences: next.occurrences, score: next.score });
      processed++;
      if (processed % SCORE_YIELD_EVERY === 0) await yieldToEventLoop();
    }
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
  type: 'analyze-result' | 'score-candidates-result' | 'error';
  requestId: number;
  candidatesByChar?: Record<string, Candidate[]>;
  message?: string;
}

async function handleMessage(e: MessageEvent<AnalysisWorkerRequest>) {
  const { type, requestId } = e.data;

  try {
    if (type === 'analyze') {
      const { ptRows, ctTokens, rowGroups, keysPerPTMode, groupSize, lockedKeys } = e.data;
      if (!ptRows || !ctTokens || !rowGroups || !keysPerPTMode || !groupSize) {
        const response: AnalysisWorkerResponse = {
          type: 'error',
          requestId,
          message: 'Invalid analyze payload.',
        };
        self.postMessage(response);
        return;
      }

      const result = await analyzeIncremental(ptRows, ctTokens, rowGroups, { keysPerPTMode, groupSize }, lockedKeys);

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

      if (!candidatesByChar || !ptRows || !ctParseMode || !effectiveCtTokens || !columns || !keysPerPTMode) {
        const response: AnalysisWorkerResponse = {
          type: 'error',
          requestId,
          message: 'Invalid scoring payload.',
        };
        self.postMessage(response);
        return;
      }

      const scored = await scoreCandidates({
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
      return;
    }

    const response: AnalysisWorkerResponse = {
      type: 'error',
      requestId,
      message: `Unknown request type: ${String(type)}`,
    };
    self.postMessage(response);
  } catch (error) {
    const response: AnalysisWorkerResponse = {
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : 'Worker analysis failed.',
    };
    self.postMessage(response);
  }
}

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  void handleMessage(e);
};
