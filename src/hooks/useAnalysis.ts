import * as React from 'react';
import type { Candidate, SelectionMap } from '../utils/analyzer';
import { fixedModeScore, separatorModeScore } from '../utils/analyzer';
import { computeRowAlloc } from '../utils/allocation';
import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';
import buildLogicalTokens from '../utils/parse/logicalTokens';
import { computePairsFromColumns } from '../utils/columns';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from '../workers/analysis.worker';

function collectGridTokenSet(
  columns: { ot: { ch: string } | null; zt: number[] }[][],
  effectiveZtTokens: ZTToken[]
): Set<string> {
  const set = new Set<string>();
  for (const row of columns) {
    for (const col of row) {
      if (!col.zt || col.zt.length === 0) continue;
      const text = col.zt.map((i: number) => effectiveZtTokens[i]?.text || '').join('');
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

function sortCandidates(map: Record<string, Candidate[]>): Record<string, Candidate[]> {
  const sorted: Record<string, Candidate[]> = {};
  for (const [ch, list] of Object.entries(map)) {
    sorted[ch] = [...list].sort((a, b) => b.score !== a.score ? b.score - a.score : a.token.localeCompare(b.token));
  }
  return sorted;
}

export function useAnalysis(params: {
  otRows: OTChar[][];
  ztParseMode: 'separator' | 'fixedLength';
  fixedLength: number;
  effectiveZtTokens: ZTToken[];
  columns: { ot: { ch: string } | null; zt: number[] }[][];
  keysPerOTMode: KeysPerOTMode;
  lockedKeys: Record<string, string | string[]>;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
}) {
  const { otRows, ztParseMode, fixedLength, effectiveZtTokens, columns, keysPerOTMode, lockedKeys, setSelections } = params;

  const gridTokenSet = React.useMemo(() => {
    if (ztParseMode !== 'fixedLength') return new Set<string>();
    return collectGridTokenSet(columns, effectiveZtTokens);
  }, [columns, effectiveZtTokens, ztParseMode]);

  const [candidatesByChar, setCandidatesByChar] = React.useState<Record<string, Candidate[]>>({});
  const [analysisDone, setAnalysisDone] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  const augmentCandidatesWithCurrentMapping = React.useCallback((base: Record<string, Candidate[]>): Record<string, Candidate[]> => {
    if (ztParseMode !== 'fixedLength') return base;

    const gs = fixedLength || 1;
    const pairs = computePairsFromColumns(columns, effectiveZtTokens, gs, keysPerOTMode);

    const currentByChar: Record<string, Set<string>> = {};
    for (const p of pairs) {
      if (!p.zt) continue;
      (currentByChar[p.ot] ||= new Set()).add(p.zt);
    }

    if (!Object.keys(currentByChar).length && gridTokenSet.size === 0) return base;

    const result: Record<string, Candidate[]> = { ...base };

    // Extend candidate lists for every OT char with:
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
  }, [columns, effectiveZtTokens, fixedLength, gridTokenSet, keysPerOTMode, ztParseMode]);

  const filterCandidatesForShiftedGrid = React.useCallback((base: Record<string, Candidate[]>): Record<string, Candidate[]> => {
    if (ztParseMode !== 'fixedLength') return base;

    // Only keep candidates that exist as a token in the *current shifted grid*
    // OR have a non-zero score.
    const out: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(base)) {
      out[ch] = list.filter(c => c.score > 0 || gridTokenSet.has(c.token));
    }
    return out;
  }, [gridTokenSet, ztParseMode]);

  const applyScores = React.useCallback((base: Record<string, Candidate[]>): Record<string, Candidate[]> => {
    if (ztParseMode !== 'fixedLength') {
      const out: Record<string, Candidate[]> = {};
      for (const [ch, list] of Object.entries(base)) {
        out[ch] = list.map(c => {
          const scored = separatorModeScore({ token: c.token, otChar: ch, otRows, effectiveZtTokens });
          return { ...c, support: scored.support, occurrences: scored.occurrences, score: scored.score };
        });
      }
      return out;
    }

    const gs = fixedLength || 1;
    const out: Record<string, Candidate[]> = {};
    for (const [ch, list] of Object.entries(base)) {
      out[ch] = list.map(c => {
        const scored = fixedModeScore({ token: c.token, otChar: ch, columns, effectiveZtTokens, groupSize: gs, keysPerOTMode });
        return { ...c, support: scored.support, occurrences: scored.occurrences, score: scored.score };
      });
    }
    return out;
  }, [columns, effectiveZtTokens, fixedLength, otRows, ztParseMode]);

  const runAnalysis = React.useCallback(() => {
    setIsAnalyzing(true);
    
    const gs = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const logicalTokens = buildLogicalTokens(effectiveZtTokens, gs);
    const alloc = computeRowAlloc(otRows as OTChar[][], logicalTokens);
    const baseCounts = alloc.groups.map(r => r.map(v => v));

    const worker = getAnalysisWorker();
    
    const handleMessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
      if (e.data.type === 'analyze-result') {
        const augmented = augmentCandidatesWithCurrentMapping(e.data.candidatesByChar);
        const scored = applyScores(augmented);
        const filtered = filterCandidatesForShiftedGrid(scored);
        setCandidatesByChar(sortCandidates(filtered));
        setSelections({});
        setAnalysisDone(true);
        setIsAnalyzing(false);
        worker.removeEventListener('message', handleMessage);
      }
    };
    
    worker.addEventListener('message', handleMessage);
    
    const request: AnalysisWorkerRequest = {
      type: 'analyze',
      otRows: otRows as OTChar[][],
      ztTokens: logicalTokens,
      rowGroups: baseCounts,
      keysPerOTMode,
      groupSize: gs,
      lockedKeys,
    };
    
    worker.postMessage(request);
  }, [applyScores, augmentCandidatesWithCurrentMapping, effectiveZtTokens, filterCandidatesForShiftedGrid, fixedLength, keysPerOTMode, lockedKeys, otRows, setSelections, ztParseMode]);

  const refreshAnalysisPreserve = React.useCallback(() => {
    const gs = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const logicalTokens = buildLogicalTokens(effectiveZtTokens, gs);
    const alloc = computeRowAlloc(otRows as OTChar[][], logicalTokens);
    const baseCounts = alloc.groups.map(r => r.map(v => v));

    const worker = getAnalysisWorker();
    
    const handleMessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
      if (e.data.type === 'analyze-result') {
        const augmented = augmentCandidatesWithCurrentMapping(e.data.candidatesByChar);
        const scored = applyScores(augmented);
        const filtered = filterCandidatesForShiftedGrid(scored);
        const sorted = sortCandidates(filtered);

        setCandidatesByChar(sorted);
        setSelections(prev => {
          const next: SelectionMap = {};
          for (const [ch, sel] of Object.entries(prev)) {
            const list = sorted[ch];
            if (list && list.some(c => c.token === sel)) next[ch] = sel;
          }
          return next;
        });
        worker.removeEventListener('message', handleMessage);
      }
    };
    
    worker.addEventListener('message', handleMessage);
    
    const request: AnalysisWorkerRequest = {
      type: 'analyze',
      otRows: otRows as OTChar[][],
      ztTokens: logicalTokens,
      rowGroups: baseCounts,
      keysPerOTMode,
      groupSize: gs,
      lockedKeys,
    };
    
    worker.postMessage(request);
  }, [applyScores, augmentCandidatesWithCurrentMapping, effectiveZtTokens, filterCandidatesForShiftedGrid, fixedLength, keysPerOTMode, lockedKeys, otRows, setSelections, ztParseMode]);

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
