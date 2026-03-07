import { useMemo } from 'react';
import type { CTToken } from '../types/domain';
import type { PTChar } from '../types/domain';

interface UseNomenklatorStatusParams {
  klamacStatusFromParse: 'none' | 'needsKlamac' | 'ok' | 'invalid';
  statusMessageFromParse: string | null;
  bracketWarningFromParse: string | null;
  analysisDone: boolean;
  ptChars: PTChar[];
  ctTokens: CTToken[];
  effectiveCtTokens: CTToken[];
  ctParseMode: 'separator' | 'fixedLength';
  fixedLength: number;
  bracketedIndices: number[];
}

interface NomenklatorStatus {
  klamacStatus: 'none' | 'needsKlamac' | 'ok' | 'invalid';
  statusMessage: string | null;
  bracketWarning: string | null;
}

/**
 * Pure derived hook: computes klamacStatus, statusMessage, and bracketWarning
 * from parse results and post-analysis data, with no side-effects.
 * Superseded values from parse are overridden once analysis completes.
 */
export function useNomenklatorStatus(params: UseNomenklatorStatusParams): NomenklatorStatus {
  const {
    klamacStatusFromParse,
    statusMessageFromParse,
    bracketWarningFromParse,
    analysisDone,
    ptChars,
    ctTokens,
    effectiveCtTokens,
    ctParseMode,
    fixedLength,
  } = params;

  const klamacAndMessage = useMemo((): { klamacStatus: NomenklatorStatus['klamacStatus']; statusMessage: string | null } => {
    const PT = ptChars.length;

    // No data yet — nothing to report
    if (PT === 0 || ctTokens.length === 0) {
      return { klamacStatus: 'none', statusMessage: null };
    }

    // Analysis not done yet — use parse-level status
    if (!analysisDone) {
      return { klamacStatus: klamacStatusFromParse, statusMessage: statusMessageFromParse };
    }

    // Analysis complete — compute from effective token counts
    const groupSize = ctParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const effChars = effectiveCtTokens.length;
    const effGroups = Math.floor(effChars / groupSize);
    const leftover = effChars % groupSize;

    if (leftover !== 0) {
      return {
        klamacStatus: 'invalid',
        statusMessage: `Deception incorrectly selected: incomplete groups (missing ${groupSize - leftover} characters).`,
      };
    }

    if (effGroups < PT) {
      return {
        klamacStatus: 'invalid',
        statusMessage: `Wrong deception selected: PT (${PT}) > CT (${effGroups}).`,
      };
    }

    if (effGroups > PT) {
      return {
        klamacStatus: 'needsKlamac',
        statusMessage: `Excess groups: ${effGroups - PT}. Choose another deception token.`,
      };
    }

    return { klamacStatus: 'ok', statusMessage: null };
  }, [
    analysisDone,
    ctParseMode,
    ctTokens.length,
    effectiveCtTokens.length,
    fixedLength,
    klamacStatusFromParse,
    ptChars.length,
    statusMessageFromParse,
  ]);

  return {
    klamacStatus: klamacAndMessage.klamacStatus,
    statusMessage: klamacAndMessage.statusMessage,
    bracketWarning: bracketWarningFromParse,
  };
}
