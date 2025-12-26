import * as React from 'react';
import type { ZTToken } from '../types/domain';
import type { OTChar } from '../components/types';

export function useNomenklatorStatus(params: {
  klamacStatusFromParse: 'none' | 'needsKlamac' | 'ok' | 'invalid';
  statusMessageFromParse: string | null;
  bracketWarningFromParse: string | null;

  setKlamacStatus: React.Dispatch<React.SetStateAction<'none' | 'needsKlamac' | 'ok' | 'invalid'>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setBracketWarning: React.Dispatch<React.SetStateAction<string | null>>;

  analysisDone: boolean;
  otChars: OTChar[];
  ztTokens: ZTToken[];
  effectiveZtTokens: ZTToken[];
  ztParseMode: 'separator' | 'fixedLength';
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
    otChars,
    ztTokens,
    effectiveZtTokens,
    ztParseMode,
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
    const OT = otChars.length;
    if (OT === 0 || ztTokens.length === 0) {
      setKlamacStatus('none');
      setStatusMessage(null);
      return;
    }
    if (!analysisDone) return;

    const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;
    const effChars = effectiveZtTokens.length;
    const effGroups = Math.floor(effChars / groupSize);
    const leftover = effChars % groupSize;

    if (leftover !== 0) {
      setKlamacStatus('invalid');
      setStatusMessage(`Deception incorrectly selected: incomplete groups (missing ${groupSize - leftover} characters).`);
      return;
    }

    if (effGroups < OT) {
      setKlamacStatus('invalid');
      setStatusMessage(`Wrong deception selected: OT (${OT}) > ZT (${effGroups}).`);
    } else if (effGroups > OT) {
      setKlamacStatus('needsKlamac');
      setStatusMessage(`Excess groups: ${effGroups - OT}. Choose another deception token.`);
    } else {
      setKlamacStatus('ok');
      setStatusMessage(null);
    }
  }, [analysisDone, bracketedIndices, effectiveZtTokens.length, fixedLength, otChars.length, setKlamacStatus, setStatusMessage, ztParseMode, ztTokens.length]);
}
