/**
 * Custom hook for parsing PT and CT inputs.
 * 
 * Manages:
 * - Parse mode selection (separator vs. fixed-length)
 * - Raw input storage per mode
 * - Token parsing and validation
 * - Deception/null token marking (bracketing)
 * 
 */

import * as React from 'react';
import type { CTToken } from '../types/domain';
import { parseFixedRaw } from '../utils/parse/fixed';
import { parseSeparatorRaw } from '../utils/parse/separator';
import { toggleBracketByGroupText, uniqueGroupTexts } from '../utils/parse/fixedLength';

/** Parsing mode for CT tokens */
export type CtParseMode = 'separator' | 'fixedLength';

/** Status of PT/CT alignment validation */
export type KlamacStatus = 'none' | 'needsNull' | 'ok' | 'invalid';

/**
 * Hook for managing CT token parsing and validation.
 */
export function useParsing(params: {
  /** Number of PT characters (for validation) */
  ptCount: number;
}) {
  const { ptCount } = params;

  const [ctParseMode, setCtParseMode] = React.useState<CtParseMode>('separator');

  // Separate raw inputs per parse mode so edits in one mode don't overwrite the other
  const [ctRawSeparator, setCtRawSeparator] = React.useState('');
  const [ctRawFixed, setCtRawFixed] = React.useState('');
  const ctRaw = ctParseMode === 'fixedLength' ? ctRawFixed : ctRawSeparator;

  const setCtRawActive = React.useCallback((v: string) => {
    if (ctParseMode === 'fixedLength') setCtRawFixed(v);
    else setCtRawSeparator(v);
  }, [ctParseMode]);

  const setCtRawForMode = React.useCallback((mode: CtParseMode, v: string) => {
    if (mode === 'fixedLength') setCtRawFixed(v);
    else setCtRawSeparator(v);
  }, []);

  const [separator, setSeparator] = React.useState<string>(':');
  const [fixedLength, setFixedLength] = React.useState<number>(1);

  const groupSize = ctParseMode === 'fixedLength' ? (fixedLength || 1) : 1;

  const [klamacStatus, setKlamacStatus] = React.useState<KlamacStatus>('none');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const parseRes = React.useMemo(() => {
    if (ctParseMode === 'separator') {
      return parseSeparatorRaw(ctRaw, separator, ptCount);
    }
    return parseFixedRaw(ctRaw, fixedLength || 1, ptCount);
  }, [ctParseMode, ctRaw, separator, fixedLength, ptCount]);

  React.useEffect(() => {
    setKlamacStatus(parseRes.klamacStatus);
    setStatusMessage(parseRes.statusMessage);
  }, [parseRes.klamacStatus, parseRes.statusMessage]);

  const ctTokens = parseRes.tokens as CTToken[];

  const [bracketedIndices, setBracketedIndices] = React.useState<number[]>([]);

  const effectiveCtTokens = React.useMemo(() => {
    if (!bracketedIndices.length) return ctTokens;
    const br = new Set(bracketedIndices);
    return ctTokens.filter((_, i) => !br.has(i));
  }, [ctTokens, bracketedIndices]);

  // Bracket validity post parse-change
  const [bracketWarning, setBracketWarning] = React.useState<string | null>(null);
  React.useEffect(() => {
    setBracketWarning(null);
    setBracketedIndices(prev => {
      if (!prev.length) return prev;
      const max = ctTokens.length;
      const filtered = prev.filter(i => i >= 0 && i < max);
      if (filtered.length !== prev.length) setBracketWarning('Some deception brackets no longer exist after parse change — removed.');
      return filtered;
    });
  }, [ctTokens.length]);

  function toggleBracketGroupByText(text: string) {
    if (!text) return;
    if (ctParseMode === 'fixedLength' && (fixedLength || 1) > 1) {
      setBracketedIndices(prev => toggleBracketByGroupText(text, ctTokens, fixedLength || 1, prev));
      return;
    }
    const same = ctTokens.map((t, i) => t.text === text ? i : -1).filter(i => i >= 0);
    setBracketedIndices(prev => {
      const set = new Set(prev);
      const all = same.every(i => set.has(i));
      if (all) same.forEach(i => set.delete(i));
      else same.forEach(i => set.add(i));
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  const uniqueCTTokenTexts = React.useMemo(() => {
    if (ctParseMode === 'fixedLength' && (fixedLength || 1) > 1) {
      return uniqueGroupTexts(ctTokens, fixedLength || 1, bracketedIndices);
    }
    const br = new Set(bracketedIndices);
    const meta = new Map<string, { allBracketed: boolean }>();
    const order: string[] = [];

    for (let i = 0; i < ctTokens.length; i++) {
      const text = ctTokens[i].text;
      const isBr = br.has(i);
      const prev = meta.get(text);
      if (!prev) {
        meta.set(text, { allBracketed: isBr });
        order.push(text);
      } else {
        prev.allBracketed = prev.allBracketed && isBr;
      }
    }

    return order.map(text => ({ text, allBracketed: meta.get(text)!.allBracketed }));
  }, [bracketedIndices, fixedLength, ctParseMode, ctTokens]);

  return {
    ctParseMode,
    setCtParseMode,
    ctRaw,
    setCtRaw: setCtRawActive,
    setCtRawForMode,
    ctRawSeparator,
    setCtRawSeparator,
    ctRawFixed,
    setCtRawFixed,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    groupSize,
    ctTokens,
    effectiveCtTokens,
    bracketedIndices,
    setBracketedIndices,
    bracketWarning,
    toggleBracketGroupByText,
    uniqueCTTokenTexts,
    klamacStatus,
    statusMessage,
  } as const;
}
