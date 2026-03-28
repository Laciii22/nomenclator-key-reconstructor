import * as React from 'react';
import type { Candidate, SelectionMap } from '../utils/analyzer';
import { fixedModeScore, separatorModeScore, buildFixedModeGridContext } from '../utils/analyzer';
import { countPtFrequency, countTokenFrequency } from '../utils/frequency';
import { computeRowAlloc } from '../utils/allocation';
import type { PTChar, CTToken, KeysPerPTMode } from '../types/domain';
import buildLogicalTokens from '../utils/parse/logicalTokens';
import { computePairsFromColumns } from '../utils/columns';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from '../workers/analysis.worker';

function collectGridTokenSet(
  columns: { pt: { ch: string } | null; ct: number[] }[][],
  effectiveCtTokens: CTToken[]
): Set<string> {
  const set = new Set<string>();
  for (const row of columns) {
    for (const col of row) {
      if (!col.ct || col.ct.length === 0) continue;
      const text = col.ct.map((i: number) => effectiveCtTokens[i]?.text || '').join('');
      if (text) set.add(text);
    }
  }
  return set;
}

// Lazy-load worker
let analysisWorker: Worker | null = null;
function getAnalysisWorker(): Worker {
  if (!analysisWorker) {
    analysisWorker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
  }
  return analysisWorker;
}

// Module-level counter: each analysis request gets a unique ID.
// The message handler checks this to discard stale responses when a newer
// request was fired before the previous worker reply arrived.
let latestRequestId = 0;

function sortCandidates(map: Record<string, Candidate[]>): Record<string, Candidate[]> {
  const sorted: Record<string, Candidate[]> = {};
  for (const [ch, list] of Object.entries(map)) {
    sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
  }
  return sorted;
}

export function useAnalysis(params: {
  ptRows: PTChar[][];
  ctParseMode: 'separator' | 'fixedLength';
  fixedLength: number;
  effectiveCtTokens: CTToken[];
  columns: { pt: { ch: string } | null; ct: number[] }[][];
  keysPerPTMode: KeysPerPTMode;
  lockedKeys: Record<string, string | string[]>;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  /** Optional worker factory — inject a fake Worker in tests to avoid real Web Worker loading. */
  _workerFactory?: () => Worker;
}) {
  const { ptRows, ctParseMode, fixedLength, effectiveCtTokens, columns, keysPerPTMode, lockedKeys, setSelections, _workerFactory } = params;

  /** Returns the singleton production worker, or a test-injected instance. */
  const getWorker = React.useCallback(
    () => (_workerFactory ? _workerFactory() : getAnalysisWorker()),
    // _workerFactory is expected to be a stable reference from the caller
    [_workerFactory],
  );

  const gridTokenSet = React.useMemo(() => {
    if (ctParseMode !== 'fixedLength') return new Set<string>();
    return collectGridTokenSet(columns, effectiveCtTokens);
  }, [columns, effectiveCtTokens, ctParseMode]);

  const [candidatesByChar, setCandidatesByChar] = React.useState<Record<string, Candidate[]>>({});
  const [analysisDone, setAnalysisDone] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  const augmentCandidatesWithCurrentMapping = React.useCallback((base: Record<string, Candidate[]>): Record<string, Candidate[]> => {
    if (ctParseMode !== 'fixedLength') return base;

    const pairs = computePairsFromColumns(columns, effectiveCtTokens, keysPerPTMode);

    const currentByChar: Record<string, Set<string>> = {};
    for (const p of pairs) {
      if (!p.ct) continue;
      (currentByChar[p.pt] ||= new Set()).add(p.ct);
    }

    if (!Object.keys(currentByChar).length && gridTokenSet.size === 0) return base;

    const result: Record<string, Candidate[]> = { ...base };

    // Extend candidate lists for every PT char with:
    // 1) tokens already mapped to that char (pairs)
    // 2) tokens currently present anywhere in the grid (gridTokenSet)
    // Scoring will be recomputed in applyScores().
    for (const ch of Object.keys(result)) {
      const existing = result[ch] ?? [];
      const occurrences = existing[0]?.occurrences ?? 1;
      const extras: Candidate[] = [];

      const tokensToAdd = new Set<string>();
      const mapped = currentByChar[ch];
      if (mapped) for (const t of mapped) tokensToAdd.add(t);
      for (const t of gridTokenSet) tokensToAdd.add(t);

      for (const t of tokensToAdd) {
        if (existing.some(c => c.token === t) || extras.some(c => c.token === t)) continue;
        extras.push({ token: t, length: 1, support: 0, occurrences, score: 0 });
      }

      result[ch] = extras.length ? [...existing, ...extras] : existing;
    }

    return result;
  }, [columns, effectiveCtTokens, fixedLength, gridTokenSet, keysPerPTMode, ctParseMode]);

  const filterCandidatesForShiftedGrid = React.useCallback((base: Record<string, Candidate[]>): Record<string, Candidate[]> => {
    if (ctParseMode !== 'fixedLength') return base;

    // Only keep candidates that exist as a token in the *current shifted grid*
    // OR have a non-zero score.
    const out: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(base)) {
      out[ch] = list.filter(c => c.score > 0 || gridTokenSet.has(c.token));
    }
    return out;
  }, [gridTokenSet, ctParseMode]);

  const applyScores = React.useCallback((base: Record<string, Candidate[]>): Record<string, Candidate[]> => {
    if (ctParseMode !== 'fixedLength') {
      // Precompute frequency maps once for the entire batch
      const ptFreq = countPtFrequency(ptRows);
      const tokenFreq = countTokenFrequency(effectiveCtTokens);
      const precomputed = { ptFreq, tokenFreq } as const;

      const out: Record<string, Candidate[]> = {};
      for (const [ch, list] of Object.entries(base)) {
        out[ch] = list.map(c => {
          const scored = separatorModeScore({ token: c.token, ptChar: ch, ptRows, effectiveCtTokens, _precomputed: precomputed });
          return { ...c, support: scored.support, occurrences: scored.occurrences, score: scored.score };
        });
      }
      return out;
    }

    // Precompute grid context once for the entire batch
    const gridCtx = buildFixedModeGridContext(columns, effectiveCtTokens);
    const gs = fixedLength || 1;
    const out: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(base)) {
      out[ch] = list.map(c => {
        const scored = fixedModeScore({ token: c.token, ptChar: ch, columns, effectiveCtTokens, groupSize: gs, keysPerPTMode, _gridCtx: gridCtx });
        return { ...c, support: scored.support, occurrences: scored.occurrences, score: scored.score };
      });
    }
    return out;
  }, [columns, effectiveCtTokens, fixedLength, ptRows, ctParseMode, keysPerPTMode]);

  /**
   * Shared worker dispatch: builds logical tokens, posts the analysis request,
   * and calls `onResult` with the final sorted candidate map.
   */
  const dispatchAnalysisRequest = React.useCallback(
    (onResult: (sorted: Record<string, Candidate[]>) => void) => {
      const gs = ctParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
      const logicalTokens = buildLogicalTokens(effectiveCtTokens, gs);
      const alloc = computeRowAlloc(ptRows as PTChar[][], logicalTokens);
      const baseCounts = alloc.groups.map(r => r.map(v => v));

      const worker = getWorker();
      const requestId = ++latestRequestId;

      const handleMessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
        if (e.data.type === 'analyze-result') {
          worker.removeEventListener('message', handleMessage);
          if (requestId !== latestRequestId) return;

          const augmented = augmentCandidatesWithCurrentMapping(e.data.candidatesByChar);
          const scored = applyScores(augmented);
          const filtered = filterCandidatesForShiftedGrid(scored);
          const sorted = sortCandidates(filtered);
          onResult(sorted);
        }
      };

      worker.addEventListener('message', handleMessage);

      const request: AnalysisWorkerRequest = {
        type: 'analyze',
        ptRows: ptRows as PTChar[][],
        ctTokens: logicalTokens,
        rowGroups: baseCounts,
        keysPerPTMode,
        groupSize: gs,
        lockedKeys,
      };

      worker.postMessage(request);
    },
    [applyScores, augmentCandidatesWithCurrentMapping, effectiveCtTokens, filterCandidatesForShiftedGrid, fixedLength, keysPerPTMode, lockedKeys, ptRows, ctParseMode, getWorker],
  );

  const runAnalysis = React.useCallback(() => {
    setIsAnalyzing(true);
    
    dispatchAnalysisRequest((sorted) => {
      setCandidatesByChar(sorted);
      setSelections(prev => (Object.keys(prev).length ? {} : prev));
      setAnalysisDone(true);
      setIsAnalyzing(false);
    });
  }, [dispatchAnalysisRequest, setSelections]);

  const refreshAnalysisPreserve = React.useCallback(() => {
    dispatchAnalysisRequest((sorted) => {
      setCandidatesByChar(sorted);
      setSelections(prev => {
        const next: SelectionMap = {};
        for (const [ch, sel] of Object.entries(prev)) {
          const list = sorted[ch];
          if (!list) continue;
          if (Array.isArray(sel)) {
            const kept = sel.filter(t => list.some(c => c.token === t));
            if (kept.length > 0) next[ch] = kept;
          } else {
            if (list.some(c => c.token === sel)) next[ch] = sel;
          }
        }
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length !== nextKeys.length) return next;
        for (const key of prevKeys) {
          const prevVal = prev[key];
          const nextVal = next[key];
          if (Array.isArray(prevVal) || Array.isArray(nextVal)) {
            if (!Array.isArray(prevVal) || !Array.isArray(nextVal)) return next;
            if (prevVal.length !== nextVal.length) return next;
            for (let i = 0; i < prevVal.length; i++) {
              if (prevVal[i] !== nextVal[i]) return next;
            }
            continue;
          }
          if (prevVal !== nextVal) return next;
        }
        return prev;
      });
    });
  }, [dispatchAnalysisRequest, setSelections]);

  return {
    candidatesByChar,
    analysisDone,
    isAnalyzing,
    runAnalysis,
    refreshAnalysisPreserve,
    augmentCandidatesWithCurrentMapping,
    setCandidatesByChar,
    setAnalysisDone,
  } as const;
}
