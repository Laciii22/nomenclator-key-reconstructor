/**
 * CandidateSelectorMulti: Multi-key (homophone) mode candidate selector.
 * 
 * Allows users to select multiple CT tokens per PT character using checkboxes.
 * Features:
 * - Checkbox-based selection (instead of radio/dropdown)
 * - Visual indicators for locked tokens
 * - Reserved token validation
 * - Score-based sorting
 * - Homophone count display
 */

import React from 'react';
import {
  buildCandidateOptions,
  buildCandidateOptionCacheKey,
  buildPTCharFlatIndexMap,
  countTotalDeceptionTokens,
  buildSuggestedTokensByChar,
  type CandidateOption,
} from './candidateHelpers';
import { sortCandidatesByScore } from './candidateSelectorCommon';
import { buildOccMap } from '../../utils/parseStrategies';
import type { SelectionMap, Candidate } from '../../utils/analyzer';
import type { PTChar, CTToken } from '../../types/domain';
import type { Column } from '../types';
import { normalizeToArray } from '../../utils/multiKeyHelpers';

/**
 * Check if token is already selected or locked for a different PT character.
 */
function isTokenUsedElsewhere(
  token: string,
  currentChar: string,
  tokenOwners: Map<string, Set<string>>,
): boolean {
  const owners = tokenOwners.get(token);
  if (!owners || owners.size === 0) return false;
  if (owners.size > 1) return true;
  return !owners.has(currentChar);
}

/**
 * Extend candidate list with locked tokens not already present.
 * Ensures locked tokens appear in the UI even if not in analysis results.
 */
function extendCandidateList(
  candidateList: Candidate[],
  lockedTokens: string[]
): Candidate[] {
  const extended = [...candidateList];
  
  for (const token of lockedTokens) {
    if (!extended.some(c => c.token === token)) {
      const existing = candidateList.find(c => c.token === token);
      extended.unshift({
        token,
        length: 1,
        support: existing ? existing.support : 0,
        occurrences: existing ? existing.occurrences : 0,
        score: existing ? existing.score : 0
      });
    }
  }
  
  return extended;
}

interface CandidateSelectorMultiProps {
  candidatesByChar: Record<string, Candidate[]>;
  lockedKeys: Record<string, string | string[]>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  ptRows: PTChar[][];
  effectiveCtTokens: CTToken[];
  reservedTokens: Set<string>;
  sharedColumns: Column[][];
}

const OUTER_HEIGHT = 384; // max-h-96

function getColumnCount(containerWidth: number): number {
  if (containerWidth >= 1080) return 4;
  if (containerWidth >= 780) return 3;
  if (containerWidth >= 520) return 2;
  return 1;
}

/**
 * Candidate selector for multi-key (homophone) mode.
 * Displays checkboxes for selecting multiple tokens per PT character.
 */
const CandidateSelectorMulti: React.FC<CandidateSelectorMultiProps> = ({
  candidatesByChar,
  lockedKeys,
  selections,
  setSelections,
  ptRows,
  effectiveCtTokens,
  reservedTokens,
  sharedColumns
}) => {
  const optionCacheRef = React.useRef<Map<string, CandidateOption>>(new Map());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = React.useState(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const next = container.clientWidth;
      setGridWidth((prev) => (next > 0 && next !== prev ? next : prev));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const charEntries = React.useMemo(
    () => Object.entries(candidatesByChar).sort((a, b) => a[0].localeCompare(b[0])),
    [candidatesByChar],
  );

  const sortedCandidatesByChar = React.useMemo(() => {
    const result: Record<string, Candidate[]> = {};
    for (const [ch, list] of charEntries) {
      const lockedTokens = normalizeToArray(lockedKeys[ch]);
      const extendedList = extendCandidateList(list, lockedTokens);
      result[ch] = sortCandidatesByScore(extendedList);
    }
    return result;
  }, [charEntries, lockedKeys]);

  const occMap = React.useMemo(
    () => buildOccMap(effectiveCtTokens, 1),
    [effectiveCtTokens],
  );

  const ptCharFlatIndexMap = React.useMemo(
    () => buildPTCharFlatIndexMap(ptRows),
    [ptRows],
  );

  const deceptionCount = React.useMemo(
    () => countTotalDeceptionTokens(sharedColumns),
    [sharedColumns],
  );

  const suggestedTokensByChar = React.useMemo(
    () => buildSuggestedTokensByChar(sharedColumns, effectiveCtTokens, lockedKeys),
    [sharedColumns, effectiveCtTokens, lockedKeys],
  );

  const tokenOwners = React.useMemo(() => {
    const owners = new Map<string, Set<string>>();

    for (const [ch, sel] of Object.entries(selections)) {
      if (!Array.isArray(sel)) continue;
      for (const token of sel) {
        if (!owners.has(token)) owners.set(token, new Set<string>());
        owners.get(token)!.add(ch);
      }
    }

    for (const [ch, lock] of Object.entries(lockedKeys)) {
      const arr = Array.isArray(lock) ? lock : [lock];
      for (const token of arr) {
        if (!owners.has(token)) owners.set(token, new Set<string>());
        owners.get(token)!.add(ch);
      }
    }

    return owners;
  }, [lockedKeys, selections]);

  const optionRowsByChar = React.useMemo(() => {
    const out: Record<string, Array<{ c: Candidate; opt: CandidateOption }>> = {};
    const cache = optionCacheRef.current;

    for (const [ch, sortedByScore] of Object.entries(sortedCandidatesByChar)) {
      const lockedTokens = normalizeToArray(lockedKeys[ch]);
      const selectedTokens = normalizeToArray(selections[ch]);
      const selectionVal = selectedTokens[0] ?? null;
      const lockedVal = lockedTokens[0];
      const cellFlatIndex = ptCharFlatIndexMap[ch] ?? -1;

      out[ch] = sortedByScore.map((c, idx) => {
        const tokenOccurrences = occMap[c.token] || [];
        const isReservedByOther =
          reservedTokens.has(c.token)
          && !selectedTokens.includes(c.token)
          && !lockedTokens.includes(c.token);
        const cacheKey = buildCandidateOptionCacheKey({
          c,
          ch,
          groupSize: 1,
          tokenOccurrences,
          cellFlatIndex,
          deceptionCount,
          isReservedByOther,
          selectionArr: selectedTokens,
          lockedArr: lockedTokens,
        });

        const opt = buildCandidateOptions({
          c,
          idx,
          ch,
          ptRows,
          effectiveCtTokens,
          groupSize: 1,
          reservedTokens,
          selectionVal,
          lockedVal,
          sharedColumns,
          _occMap: occMap,
          _ptCharFlatIndexMap: ptCharFlatIndexMap,
          _deceptionCount: deceptionCount,
          _cache: cache,
          _cacheKey: cacheKey,
        });

        return { c, opt };
      });
    }

    return out;
  }, [
    sortedCandidatesByChar,
    lockedKeys,
    selections,
    ptCharFlatIndexMap,
    occMap,
    reservedTokens,
    deceptionCount,
    ptRows,
    effectiveCtTokens,
    sharedColumns,
  ]);

  const cardModels = React.useMemo(() => {
    return charEntries.map(([ch]) => {
      const lockedTokens = normalizeToArray(lockedKeys[ch]);
      const selectedTokens = normalizeToArray(selections[ch]);
      const allTokens = new Set([...lockedTokens, ...selectedTokens]);
      const isLocked = lockedTokens.length > 0;
      return {
        ch,
        lockedTokens,
        selectedTokens,
        allTokensCount: allTokens.size,
        optionRows: optionRowsByChar[ch] ?? [],
        isLocked,
      };
    });
  }, [charEntries, lockedKeys, selections, optionRowsByChar]);

  const columnCount = React.useMemo(
    () => getColumnCount(gridWidth),
    [gridWidth],
  );

  const supportBudgetByChar = React.useMemo(() => {
    const byChar: Record<string, { supportByToken: Map<string, number>; maxOccurrences: number }> = {};
    for (const [ch, list] of Object.entries(sortedCandidatesByChar)) {
      const supportByToken = new Map<string, number>();
      let maxOccurrences = 0;
      for (const c of list) {
        supportByToken.set(c.token, c.support);
        if (c.occurrences > maxOccurrences) maxOccurrences = c.occurrences;
      }
      byChar[ch] = { supportByToken, maxOccurrences };
    }
    return byChar;
  }, [sortedCandidatesByChar]);

  const hasAnyLock = React.useMemo(
    () => Object.values(lockedKeys).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))),
    [lockedKeys],
  );

  const handleToggleToken = React.useCallback((char: string, token: string) => {
    setSelections(prev => {
      const currentArr = normalizeToArray(prev[char]);
      const hasIt = currentArr.includes(token);

      if (!hasIt) {
        const budget = supportBudgetByChar[char];
        if (budget && budget.maxOccurrences > 0) {
          const lockedArr = normalizeToArray(lockedKeys[char]);
          const chosen = new Set<string>([...lockedArr, ...currentArr]);

          let chosenSupport = 0;
          for (const chosenToken of chosen) {
            chosenSupport += budget.supportByToken.get(chosenToken) ?? 0;
          }

          const candidateSupport = budget.supportByToken.get(token) ?? 0;
          if (chosenSupport + candidateSupport > budget.maxOccurrences) {
            return prev;
          }
        }
      }

      const nextArr = hasIt
        ? currentArr.filter(t => t !== token)
        : [...currentArr, token];
      return { ...prev, [char]: nextArr.length > 0 ? nextArr : null };
    });
  }, [setSelections, supportBudgetByChar, lockedKeys]);

  const renderCard = React.useCallback((model: {
    ch: string;
    lockedTokens: string[];
    selectedTokens: string[];
    allTokensCount: number;
    optionRows: Array<{ c: Candidate; opt: CandidateOption }>;
    isLocked: boolean;
  }) => (
    <section
      key={model.ch}
      className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur"
    >
      <header className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <span
          className={`inline-flex min-w-9 items-center justify-center rounded-md border px-2 py-0.5 font-mono text-base font-semibold ${
            model.isLocked
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
              : 'border-amber-300 bg-amber-100 text-amber-800'
          }`}
          title={model.isLocked ? `Locked: ${model.lockedTokens.join(', ')}` : undefined}
        >
          {model.ch}
        </span>
        <span className="text-xs font-medium text-slate-500">
          {model.allTokensCount} homophone{model.allTokensCount > 1 ? 's' : ''}
        </span>
      </header>

      <div className="max-h-[172px] space-y-1.5 overflow-y-auto pr-1">
        {model.optionRows.map(({ c, opt }, idx) => {
          const token = c.token;
          const suggestedTokens = hasAnyLock ? (suggestedTokensByChar[model.ch] ?? []) : [];
          const isLockedToken = model.lockedTokens.includes(token);
          const isSelectedToken = model.selectedTokens.includes(token);
          const isSuggestedToken = Boolean(
            suggestedTokens.includes(token)
            && !isLockedToken
            && !isSelectedToken
          );
          const isChecked = isLockedToken || isSelectedToken;
          const budget = supportBudgetByChar[model.ch];
          const chosen = new Set<string>([...model.lockedTokens, ...model.selectedTokens]);
          let chosenSupport = 0;
          for (const chosenToken of chosen) {
            chosenSupport += budget?.supportByToken.get(chosenToken) ?? 0;
          }
          const wouldExceedSupportBudget = !isChecked
            && Boolean(budget && budget.maxOccurrences > 0)
            && (chosenSupport + c.support > (budget?.maxOccurrences ?? 0));
          const isUsedElsewhere = isTokenUsedElsewhere(token, model.ch, tokenOwners);
          const isReservedElsewhere =
            reservedTokens.has(token) && !isLockedToken && !isSelectedToken;

          const isDisabled =
            isLockedToken
            || (model.isLocked && !isLockedToken)
            || isReservedElsewhere
            || wouldExceedSupportBudget
            || isUsedElsewhere;

          return (
            <label
              key={`${model.ch}-${token}-${idx}`}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                isLockedToken
                  ? 'border-emerald-200 bg-emerald-50'
                  : isSelectedToken
                    ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                    : isDisabled
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-55'
                      : isSuggestedToken
                        ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                        : 'border-transparent bg-slate-50/50 hover:border-slate-200 hover:bg-slate-100'
              }`}
              title={
                isUsedElsewhere
                  ? 'Already used for another PT character'
                  : wouldExceedSupportBudget
                    ? `Would exceed max occurrences for ${model.ch} (${chosenSupport + c.support}/${budget?.maxOccurrences ?? 0})`
                    : opt.title
              }
            >
              <input
                type="checkbox"
                className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleToggleToken(model.ch, token)}
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="font-mono font-medium text-slate-800">
                  {token}{isSuggestedToken ? ' (suggested)' : ''}
                </span>
                <span className="shrink-0 text-xs text-slate-500" title="Score / Support / Occurrences">
                  {c.score.toFixed(2)} ({c.support}/{c.occurrences})
                </span>
              </div>
            </label>
          );
        })}
      </div>

      {model.isLocked && (
        <footer className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
          <strong>Locked:</strong> {model.lockedTokens.join(', ')}
        </footer>
      )}
    </section>
  ), [
    tokenOwners,
    reservedTokens,
    hasAnyLock,
    suggestedTokensByChar,
    supportBudgetByChar,
    handleToggleToken,
  ]);

  return (
    <div
      ref={containerRef}
      className="max-h-96 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 p-3"
      style={{ height: OUTER_HEIGHT }}
    >
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        {cardModels.map(renderCard)}
      </div>
    </div>
  );
};

export default React.memo(CandidateSelectorMulti);
