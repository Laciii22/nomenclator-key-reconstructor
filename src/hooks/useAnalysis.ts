import * as React from 'react';
import type { Candidate, SelectionMap } from '../utils/analyzer';
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

function terminateAnalysisWorker() {
  if (!analysisWorker) return;
  analysisWorker.terminate();
  analysisWorker = null;
}

// Module-level counter: each analysis request gets a unique ID.
// The message handler checks this to discard stale responses when a newer
// request was fired before the previous worker reply arrived.
let latestRequestId = 0;
const ANALYSIS_TIMEOUT_MS = 30000;

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
    (forceRestart = false) => {
      if (_workerFactory) return _workerFactory();
      if (forceRestart) terminateAnalysisWorker();
      return getAnalysisWorker();
    },
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
  const isMountedRef = React.useRef(true);
  const activeRequestCleanupRef = React.useRef<null | (() => void)>(null);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      activeRequestCleanupRef.current?.();
      activeRequestCleanupRef.current = null;
      isMountedRef.current = false;
      latestRequestId += 1;
      terminateAnalysisWorker();
    };
  }, []);

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
  }, [columns, effectiveCtTokens, gridTokenSet, keysPerPTMode, ctParseMode]);

  /**
   * Shared worker dispatch: builds logical tokens, posts the analysis request,
   * and calls `onResult` with the final sorted candidate map.
   */
  const dispatchAnalysisRequest = React.useCallback(
    (
      onResult: (sorted: Record<string, Candidate[]>) => void,
      onError?: (message: string) => void,
    ) => {
      activeRequestCleanupRef.current?.();
      activeRequestCleanupRef.current = null;

      const gs = ctParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
      const logicalTokens = buildLogicalTokens(effectiveCtTokens, gs);
      const alloc = computeRowAlloc(ptRows as PTChar[][], logicalTokens);
      const baseCounts = alloc.groups.map(r => r.map(v => v));

      // For production worker, restart on each new request to stop superseded
      // in-flight computations immediately and reclaim worker CPU.
      const worker = getWorker(true);
      const requestId = ++latestRequestId;
      let settled = false;
      let timeoutId: ReturnType<typeof window.setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId != null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleWorkerError);
        if (activeRequestCleanupRef.current === cleanup) {
          activeRequestCleanupRef.current = null;
        }
      };

      const settle = (errorMessage?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (errorMessage) onError?.(errorMessage);
      };

      const handleWorkerError = () => {
        if (requestId !== latestRequestId) return;
        settle('Analysis worker error. Please try again.');
      };

      const handleMessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
        if (e.data.requestId !== requestId) return;
        if (requestId !== latestRequestId) {
          settle();
          return;
        }

        if (e.data.type === 'error') {
          settle(e.data.message || 'Analysis failed.');
          return;
        }

        if (e.data.type === 'analyze-result') {
          if (!e.data.candidatesByChar) {
            settle('Analysis response was missing candidates.');
            return;
          }
          const augmented = augmentCandidatesWithCurrentMapping(e.data.candidatesByChar);
          const scoreRequest: AnalysisWorkerRequest = {
            type: 'score-candidates',
            requestId,
            candidatesByChar: augmented,
            ptRows: ptRows as PTChar[][],
            ctParseMode,
            fixedLength,
            effectiveCtTokens,
            columns,
            keysPerPTMode,
            gridTokenSet: Array.from(gridTokenSet),
          };
          try {
            worker.postMessage(scoreRequest);
          } catch {
            settle('Failed to score analysis results.');
          }
          return;
        }

        if (e.data.type === 'score-candidates-result') {
          if (!e.data.candidatesByChar) {
            settle('Scoring response was missing candidates.');
            return;
          }
          settle();
          const sorted = sortCandidates(e.data.candidatesByChar);
          onResult(sorted);
        }
      };

      timeoutId = window.setTimeout(() => {
        if (requestId !== latestRequestId) return;
        if (!_workerFactory) terminateAnalysisWorker();
        settle('Analysis timed out. Please try again.');
      }, ANALYSIS_TIMEOUT_MS);

      activeRequestCleanupRef.current = cleanup;

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleWorkerError);

      const request: AnalysisWorkerRequest = {
        type: 'analyze',
        requestId,
        ptRows: ptRows as PTChar[][],
        ctTokens: logicalTokens,
        rowGroups: baseCounts,
        keysPerPTMode,
        groupSize: gs,
        lockedKeys,
      };

      try {
        worker.postMessage(request);
      } catch {
        settle('Failed to start analysis.');
      }
    },
    [augmentCandidatesWithCurrentMapping, columns, effectiveCtTokens, fixedLength, keysPerPTMode, lockedKeys, ptRows, ctParseMode, getWorker, gridTokenSet, _workerFactory],
  );

  const runAnalysis = React.useCallback(() => {
    setIsAnalyzing(true);
    
    dispatchAnalysisRequest(
      (sorted) => {
        if (!isMountedRef.current) return;
        setCandidatesByChar(sorted);
        setSelections(prev => (Object.keys(prev).length ? {} : prev));
        setAnalysisDone(true);
        setIsAnalyzing(false);
      },
      () => {
        if (!isMountedRef.current) return;
        setIsAnalyzing(false);
      }
    );
  }, [dispatchAnalysisRequest, setSelections]);

  const refreshAnalysisPreserve = React.useCallback(() => {
    setIsAnalyzing(true);
    dispatchAnalysisRequest((sorted) => {
      if (!isMountedRef.current) return;
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
      setIsAnalyzing(false);
    }, () => {
      if (!isMountedRef.current) return;
      setIsAnalyzing(false);
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
