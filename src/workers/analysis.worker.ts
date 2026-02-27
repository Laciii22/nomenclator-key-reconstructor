/**
 * Web Worker for frequency analysis.
 * Offloads heavy computation from main thread to prevent UI blocking.
 */

import type { PTChar, CTToken } from '../types/domain';
import { analyze } from '../utils/analyzer';
import type { Candidate } from '../utils/analyzer';

export interface AnalysisWorkerRequest {
  type: 'analyze';
  ptRows: PTChar[][];
  ctTokens: CTToken[];
  rowGroups: number[][];
  keysPerPTMode: 'single' | 'multiple';
  groupSize: number;
  lockedKeys?: Record<string, string | string[]>;
}

export interface AnalysisWorkerResponse {
  type: 'analyze-result';
  candidatesByChar: Record<string, Candidate[]>;
}

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { type, ptRows, ctTokens, rowGroups, keysPerPTMode, groupSize, lockedKeys } = e.data;
  
  if (type === 'analyze') {
    const result = analyze(ptRows, ctTokens, rowGroups, { keysPerPTMode, groupSize }, lockedKeys);
    
    const response: AnalysisWorkerResponse = {
      type: 'analyze-result',
      candidatesByChar: result.candidatesByChar,
    };
    
    self.postMessage(response);
  }
};
