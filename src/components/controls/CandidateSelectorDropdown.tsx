/**
 * Shared single-key candidate selector grid.
 *
 * Renders a dropdown per PT character, sorted alphabetically, with score-sorted
 * candidates. Used by both Fixed and Separator modes — the only differences
 * are `groupSize` and the empty-option label text.
 */

import React from 'react';
import { buildCandidateOptions } from './candidateHelpers';
import {
  extendCandidateListWithLocked,
  sortCandidatesByScore,
  getCurrentSelectorValue,
  getPTCharBadgeClasses,
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
        {Object.entries(candidatesByChar).sort((a, b) => a[0].localeCompare(b[0])).map(([ch, list]) => {
          const lockedVal = lockedKeys[ch];
          const selectionVal = selections[ch];
          const normalizedSelectionVal = Array.isArray(selectionVal) ? selectionVal[0] : (selectionVal ?? null);
          const currentValue = getCurrentSelectorValue(lockedVal, normalizedSelectionVal);
          const disabledSelect = Boolean(lockedVal);
          const extendedList = extendCandidateListWithLocked(list, lockedVal);
          const sortedByScore = sortCandidatesByScore(extendedList);

          return (
            <div key={ch} className="flex items-center gap-3">
              <div className="w-10 font-mono text-center">
                <span className={`inline-block px-2 py-0.5 rounded border ${getPTCharBadgeClasses(Boolean(lockedVal))}`} title={lockedVal ? `Locked: ${lockedVal}` : undefined}>{ch}</span>
              </div>
              <select
                className={getSelectorInputClasses(disabledSelect)}
                value={currentValue}
                disabled={disabledSelect}
                onChange={(e) => {
                  const val = e.target.value || '';
                  setSelections((prev) => ({ ...prev, [ch]: val === '' ? null : val }));
                }}
              >
                <option value="">{emptyOptionLabel}</option>
                {sortedByScore.filter((c) => c.length === 1).map((c, idx) => {
                  const opt = buildCandidateOptions({ c, idx, ch, ptRows, effectiveCtTokens, groupSize, reservedTokens, selectionVal: normalizedSelectionVal, lockedVal, sharedColumns });
                  return (
                    <option key={idx} value={opt.token} disabled={opt.disabled} title={opt.title}>{opt.label}</option>
                  );
                })}
              </select>
              {lockedVal && (
                <span className="text-xs text-green-700">locked: {lockedVal}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(CandidateSelectorDropdown);
