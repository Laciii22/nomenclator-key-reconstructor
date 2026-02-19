import React from 'react';
import { buildCandidateOptions } from './candidateHelpers';
import {
  extendCandidateListWithLocked,
  sortCandidatesByScore,
  getCurrentSelectorValue,
  isSelectorDisabled,
  getOTCharBadgeClasses,
  getSelectorInputClasses
} from './candidateSelectorCommon';
import type { OTChar, ZTToken } from '../../types/domain';
import type { Candidate, SelectionMap } from '../../utils/analyzer';
import type { Column } from '../types';

type Props = {
  candidatesByChar: Record<string, Candidate[]>;
  lockedKeys: Record<string, string>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  otRows: OTChar[][];
  effectiveZtTokens: ZTToken[];
  fixedLength: number;
  reservedTokens: Set<string>;
  sharedColumns: Column[][];
};

const CandidateSelectorFixed: React.FC<Props> = ({ candidatesByChar, lockedKeys, selections, setSelections, otRows, effectiveZtTokens, fixedLength, reservedTokens, sharedColumns }) => {
  const groupSize = Math.max(1, fixedLength || 1);

  return (
    <div className="grid grid-cols-3 gap-3">
      {Object.entries(candidatesByChar).sort((a,b)=> a[0].localeCompare(b[0])).map(([ch, list]) => {
        const lockedVal = lockedKeys[ch];
        const selectionVal = selections[ch];
        const normalizedSelectionVal = Array.isArray(selectionVal) ? selectionVal[0] : (selectionVal ?? null);
        const currentValue = getCurrentSelectorValue(lockedVal, normalizedSelectionVal);
        const disabledSelect = isSelectorDisabled(lockedVal);
        const extendedList = extendCandidateListWithLocked(list, lockedVal);
        const sortedByScore = sortCandidatesByScore(extendedList);

        return (
          <div key={ch} className="flex items-center gap-3">
            <div className="w-10 font-mono text-center">
              <span className={`inline-block px-2 py-0.5 rounded border ${getOTCharBadgeClasses(Boolean(lockedVal))}`} title={lockedVal ? `Locked: ${lockedVal}` : undefined}>{ch}</span>
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
              <option value="">None</option>
              {sortedByScore.filter((c) => c.length === 1).map((c, idx) => {
                const opt = buildCandidateOptions({ c, idx, ch, otRows, effectiveZtTokens, groupSize, reservedTokens, selectionVal: normalizedSelectionVal, lockedVal, sharedColumns });
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
  );
};

export default React.memo(CandidateSelectorFixed);
