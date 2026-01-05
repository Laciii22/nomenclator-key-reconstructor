/**
 * Custom hook for parsing OT and ZT inputs.
 * 
 * Manages:
 * - Parse mode selection (separator vs. fixed-length)
 * - Raw input storage per mode
 * - Token parsing and validation
 * - Deception/null token marking (bracketing)
 * 
 * @param params Configuration with OT count for validation
 * @returns Parsing state and controls
 */

import * as React from 'react';
import type { ZTToken } from '../types/domain';
import { parseFixedRaw } from '../utils/parse/fixed';
import { parseSeparatorRaw } from '../utils/parse/separator';
import { toggleBracketByGroupText, uniqueGroupTexts } from '../utils/parse/fixedLength';

/** Parsing mode for ZT tokens */
export type ZtParseMode = 'separator' | 'fixedLength';

/** Status of OT/ZT alignment validation */
export type KlamacStatus = 'none' | 'needsKlamac' | 'ok' | 'invalid';

/**
 * Hook for managing ZT token parsing and validation.
 */
export function useParsing(params: {
  /** Number of OT characters (for validation) */
  otCount: number;
}) {
  const { otCount } = params;

  const [ztParseMode, setZtParseMode] = React.useState<ZtParseMode>('separator');

  // Separate raw inputs per parse mode so edits in one mode don't overwrite the other
  const [ztRawSeparator, setZtRawSeparator] = React.useState('');
  const [ztRawFixed, setZtRawFixed] = React.useState('');
  const ztRaw = ztParseMode === 'fixedLength' ? ztRawFixed : ztRawSeparator;

  const setZtRawActive = React.useCallback((v: string) => {
    if (ztParseMode === 'fixedLength') setZtRawFixed(v);
    else setZtRawSeparator(v);
  }, [ztParseMode]);

  const setZtRawForMode = React.useCallback((mode: ZtParseMode, v: string) => {
    if (mode === 'fixedLength') setZtRawFixed(v);
    else setZtRawSeparator(v);
  }, []);

  const [separator, setSeparator] = React.useState<string>(':');
  const [fixedLength, setFixedLength] = React.useState<number>(1);

  const groupSize = ztParseMode === 'fixedLength' ? (fixedLength || 1) : 1;

  const [klamacStatus, setKlamacStatus] = React.useState<KlamacStatus>('none');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const parseRes = React.useMemo(() => {
    if (ztParseMode === 'separator') {
      return parseSeparatorRaw(ztRaw, separator, otCount);
    }
    return parseFixedRaw(ztRaw, fixedLength || 1, otCount);
  }, [ztParseMode, ztRaw, separator, fixedLength, otCount]);

  React.useEffect(() => {
    setKlamacStatus(parseRes.klamacStatus);
    setStatusMessage(parseRes.statusMessage);
  }, [parseRes.klamacStatus, parseRes.statusMessage]);

  const ztTokens = parseRes.tokens as ZTToken[];

  const [bracketedIndices, setBracketedIndices] = React.useState<number[]>([]);

  const effectiveZtTokens = React.useMemo(() => {
    if (!bracketedIndices.length) return ztTokens;
    const br = new Set(bracketedIndices);
    return ztTokens.filter((_, i) => !br.has(i));
  }, [ztTokens, bracketedIndices]);

  // Bracket validity post parse-change
  const [bracketWarning, setBracketWarning] = React.useState<string | null>(null);
  React.useEffect(() => {
    setBracketWarning(null);
    setBracketedIndices(prev => {
      if (!prev.length) return prev;
      const max = ztTokens.length;
      const filtered = prev.filter(i => i >= 0 && i < max);
      if (filtered.length !== prev.length) setBracketWarning('Some deception brackets no longer exist after parse change — removed.');
      return filtered;
    });
  }, [ztTokens.length]);

  function toggleBracketGroupByText(text: string) {
    if (!text) return;
    if (ztParseMode === 'fixedLength' && (fixedLength || 1) > 1) {
      setBracketedIndices(prev => toggleBracketByGroupText(text, ztTokens, fixedLength || 1, prev));
      return;
    }
    const same = ztTokens.map((t, i) => t.text === text ? i : -1).filter(i => i >= 0);
    setBracketedIndices(prev => {
      const set = new Set(prev);
      const all = same.every(i => set.has(i));
      if (all) same.forEach(i => set.delete(i));
      else same.forEach(i => set.add(i));
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  const uniqueZTTokenTexts = React.useMemo(() => {
    if (ztParseMode === 'fixedLength' && (fixedLength || 1) > 1) {
      return uniqueGroupTexts(ztTokens, fixedLength || 1, bracketedIndices);
    }
    const seen = new Set<string>();
    const br = new Set(bracketedIndices);
    const map = new Map<string, number[]>();
    ztTokens.forEach((t, i) => { (map.get(t.text) || map.set(t.text, []).get(t.text))?.push(i); });
    const out: { text: string; allBracketed: boolean }[] = [];
    for (const t of ztTokens) {
      if (seen.has(t.text)) continue;
      seen.add(t.text);
      const idxs = map.get(t.text) || [];
      out.push({ text: t.text, allBracketed: idxs.length > 0 && idxs.every(i => br.has(i)) });
    }
    return out;
  }, [bracketedIndices, fixedLength, ztParseMode, ztTokens]);

  return {
    ztParseMode,
    setZtParseMode,
    ztRaw,
    setZtRaw: setZtRawActive,
    setZtRawForMode,
    ztRawSeparator,
    setZtRawSeparator,
    ztRawFixed,
    setZtRawFixed,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    groupSize,
    ztTokens,
    effectiveZtTokens,
    bracketedIndices,
    setBracketedIndices,
    bracketWarning,
    toggleBracketGroupByText,
    uniqueZTTokenTexts,
    klamacStatus,
    statusMessage,
  } as const;
}
