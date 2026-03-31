/**
 * Shared single-key candidate selector grid.
 *
 * Renders a dropdown per PT character, sorted alphabetically, with score-sorted
 * candidates. Used by both Fixed and Separator modes — the only differences
 * are `groupSize` and the empty-option label text.
 */

import React from 'react';
import { buildCandidateOptions, buildPTCharFlatIndexMap, countTotalDeceptionTokens, buildSuggestedTokensByChar } from './candidateHelpers';
import { buildOccMap } from '../../utils/parseStrategies';
import {
  extendCandidateListWithLocked,
  sortCandidatesByScore,
  getCurrentSelectorValue,
  getSelectorInputClasses
} from './candidateSelectorCommon';
import type { PTChar, CTToken } from '../../types/domain';
import type { Candidate, SelectionMap } from '../../utils/analyzer';
import type { Column } from '../types';

export type CandidateSelectorDropdownProps = {
  candidatesByChar: Record<string, Candidate[]>;
  lockedKeys: Record<string, string>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  ptRows: PTChar[][];
  effectiveCtTokens: CTToken[];
  reservedTokens: Set<string>;
  sharedColumns: Column[][];
  /** Size of token groups (1 for separator, >1 for fixed-length) */
  groupSize: number;
  /** Label for the empty "no selection" option */
  emptyOptionLabel?: string;
};

const CandidateSelectorDropdown: React.FC<CandidateSelectorDropdownProps> = ({
  candidatesByChar, lockedKeys, selections, setSelections,
  ptRows, effectiveCtTokens, reservedTokens, sharedColumns,
  groupSize, emptyOptionLabel = 'None',
}) => {
  const charEntries = React.useMemo(
    () => Object.entries(candidatesByChar).sort((a, b) => a[0].localeCompare(b[0])),
    [candidatesByChar],
  );

  const occMap = React.useMemo(
    () => buildOccMap(effectiveCtTokens, groupSize),
    [effectiveCtTokens, groupSize],
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

  const sortedCandidatesByChar = React.useMemo(() => {
    const result: Record<string, Candidate[]> = {};
    for (const [ch, list] of charEntries) {
      const lockedVal = lockedKeys[ch];
      const extendedList = extendCandidateListWithLocked(list, lockedVal);
      result[ch] = sortCandidatesByScore(extendedList).filter((c) => c.length === 1);
    }
    return result;
  }, [charEntries, lockedKeys]);

  const hasAnyLock = React.useMemo(
    () => Object.values(lockedKeys).some((v) => typeof v === 'string' && v.length > 0),
    [lockedKeys],
  );

  const totalChars = Object.keys(candidatesByChar).length;
  const assignedChars = Object.entries(candidatesByChar).filter(([ch]) => lockedKeys[ch] || selections[ch]).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500">Assigned:</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          assignedChars === totalChars ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>{assignedChars} / {totalChars}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {charEntries.map(([ch]) => {
          const lockedVal = lockedKeys[ch];
          const selectionVal = selections[ch];
          const normalizedSelectionVal = Array.isArray(selectionVal) ? selectionVal[0] : (selectionVal ?? null);
          const currentValue = getCurrentSelectorValue(lockedVal, normalizedSelectionVal);
          const disabledSelect = Boolean(lockedVal);
          const sortedByScore = sortedCandidatesByChar[ch] ?? [];
          const suggestedTokens = hasAnyLock ? (suggestedTokensByChar[ch] ?? []) : [];
          const suggestedToken = suggestedTokens.length === 1 ? suggestedTokens[0] : null;
          const showSuggestion = !lockedVal && !normalizedSelectionVal && Boolean(suggestedToken);

          return (
            <div key={ch} className="flex items-center gap-3">
              <select
                className={`${getSelectorInputClasses(disabledSelect)} ${showSuggestion ? 'ring-1 ring-amber-300 bg-amber-50' : ''}`}
                value={currentValue}
                disabled={disabledSelect}
                onChange={(e) => {
                  const val = e.target.value || '';
                  setSelections((prev) => ({ ...prev, [ch]: val === '' ? null : val }));
                }}
              >
                <option value="">{emptyOptionLabel}</option>
                {sortedByScore.map((c, idx) => {
                  const opt = buildCandidateOptions({
                    c,
                    idx,
                    ch,
                    ptRows,
                    effectiveCtTokens,
                    groupSize,
                    reservedTokens,
                    selectionVal: normalizedSelectionVal,
                    lockedVal,
                    sharedColumns,
                    _occMap: occMap,
                    _ptCharFlatIndexMap: ptCharFlatIndexMap,
                    _deceptionCount: deceptionCount,
                  });
                  return (
                    <option key={idx} value={opt.token} disabled={opt.disabled} title={opt.title}>
                      {opt.label}{showSuggestion && opt.token === suggestedToken ? ' (suggested)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(CandidateSelectorDropdown);
