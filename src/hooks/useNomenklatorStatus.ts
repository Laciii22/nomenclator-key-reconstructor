import * as React from 'react';
import type { CTToken } from '../types/domain';
import type { PTChar } from '../components/types';

export function useNomenklatorStatus(params: {
  klamacStatusFromParse: 'none' | 'needsKlamac' | 'ok' | 'invalid';
  statusMessageFromParse: string | null;
  bracketWarningFromParse: string | null;

  setKlamacStatus: React.Dispatch<React.SetStateAction<'none' | 'needsKlamac' | 'ok' | 'invalid'>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setBracketWarning: React.Dispatch<React.SetStateAction<string | null>>;

  analysisDone: boolean;
  ptChars: PTChar[];
  ctTokens: CTToken[];
  effectiveCtTokens: CTToken[];
  ctParseMode: 'separator' | 'fixedLength';
  fixedLength: number;
  bracketedIndices: number[];
}) {
  const {
    klamacStatusFromParse,
    statusMessageFromParse,
    bracketWarningFromParse,
    setKlamacStatus,
    setStatusMessage,
    setBracketWarning,
    analysisDone,
    ptChars,
    ctTokens,
    effectiveCtTokens,
    ctParseMode,
    fixedLength,
    bracketedIndices,
  } = params;

  React.useEffect(() => {
    setKlamacStatus(klamacStatusFromParse);
    setStatusMessage(statusMessageFromParse);
  }, [klamacStatusFromParse, setKlamacStatus, setStatusMessage, statusMessageFromParse]);

  React.useEffect(() => {
    setBracketWarning(bracketWarningFromParse);
  }, [bracketWarningFromParse, setBracketWarning]);

  // Status update after analysis w.r.t. brackets
  React.useEffect(() => {
    const PT = ptChars.length;
    if (PT === 0 || ctTokens.length === 0) {
      setKlamacStatus('none');
      setStatusMessage(null);
      return;
    }
    if (!analysisDone) return;

    const groupSize = ctParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const effChars = effectiveCtTokens.length;
    const effGroups = Math.floor(effChars / groupSize);
    const leftover = effChars % groupSize;

    if (leftover !== 0) {
      setKlamacStatus('invalid');
      setStatusMessage(`Deception incorrectly selected: incomplete groups (missing ${groupSize - leftover} characters).`);
      return;
    }

    if (effGroups < PT) {
      setKlamacStatus('invalid');
      setStatusMessage(`Wrong deception selected: PT (${PT}) > CT (${effGroups}).`);
    } else if (effGroups > PT) {
      setKlamacStatus('needsKlamac');
      setStatusMessage(`Excess groups: ${effGroups - PT}. Choose another deception token.`);
    } else {
      setKlamacStatus('ok');
      setStatusMessage(null);
    }
  }, [analysisDone, bracketedIndices, effectiveCtTokens.length, fixedLength, ptChars.length, setKlamacStatus, setStatusMessage, ctParseMode, ctTokens.length]);
}
