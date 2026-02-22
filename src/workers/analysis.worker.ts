/**
 * Web Worker for frequency analysis.
 * Offloads heavy computation from main thread to prevent UI blocking.
 */

import type { OTChar, ZTToken } from '../types/domain';
import { analyze } from '../utils/analyzer';
import type { Candidate } from '../utils/analyzer';

export interface AnalysisWorkerRequest {
  type: 'analyze';
  otRows: OTChar[][];
  ztTokens: ZTToken[];
  rowGroups: number[][];
  keysPerOTMode: 'single' | 'multiple';
  groupSize: number;
  lockedKeys?: Record<string, string | string[]>;
}

export interface AnalysisWorkerResponse {
  type: 'analyze-result';
  candidatesByChar: Record<string, Candidate[]>;
}

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { type, otRows, ztTokens, rowGroups, keysPerOTMode, groupSize, lockedKeys } = e.data;
  
  if (type === 'analyze') {
    const result = analyze(otRows, ztTokens, rowGroups, { keysPerOTMode, groupSize }, lockedKeys);
    
    const response: AnalysisWorkerResponse = {
      type: 'analyze-result',
      candidatesByChar: result.candidatesByChar,
    };
    
    self.postMessage(response);
  }
};
