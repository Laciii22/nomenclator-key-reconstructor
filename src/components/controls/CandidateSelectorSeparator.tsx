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
import type { SelectionMap } from '../../utils/analyzer';

type Props = {
  candidatesByChar: Record<string, any[]>;
  lockedKeys: Record<string, string>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  otRows: any[];
  effectiveZtTokens: any[];
  reservedTokens: Set<string>;
  sharedColumns: any;
};

const CandidateSelectorSeparator: React.FC<Props> = ({ candidatesByChar, lockedKeys, selections, setSelections, otRows, effectiveZtTokens, reservedTokens, sharedColumns }) => {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Object.entries(candidatesByChar).sort((a,b)=> a[0].localeCompare(b[0])).map(([ch, list]) => {
        const lockedVal = lockedKeys[ch];
        const selectionVal = selections[ch];
        const currentValue = getCurrentSelectorValue(lockedVal, selectionVal);
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
                setSelections((prev: any) => ({ ...prev, [ch]: val === '' ? null : val }));
              }}
            >
              <option value="">None (do not lock)</option>
              {sortedByScore.filter((c:any) => c.length === 1).map((c:any, idx:number) => {
                const opt = buildCandidateOptions({ c, idx, ch, otRows, effectiveZtTokens, groupSize: 1, reservedTokens, selectionVal, lockedVal, sharedColumns });
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

export default React.memo(CandidateSelectorSeparator);
