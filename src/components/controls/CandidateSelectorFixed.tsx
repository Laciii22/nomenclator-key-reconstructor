import React from 'react';
import { buildCandidateOptions } from './candidateHelpers';
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
        const currentValue = normalizedSelectionVal ?? lockedVal ?? '';
        const disabledSelect = Boolean(lockedVal);
        const extendedList = [...list];
        if (lockedVal && !extendedList.some(c => c.token === lockedVal)) {
          extendedList.unshift({ token: lockedVal, length: 1, support: 0, occurrences: 0, score: 1 });
        }
        const sortedByScore = extendedList.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.token.localeCompare(b.token);
        });

        return (
          <div key={ch} className="flex items-center gap-3">
            <div className="w-10 font-mono text-center">
              <span className={`inline-block px-2 py-0.5 rounded border ${lockedVal ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`} title={lockedVal ? `Locked: ${lockedVal}` : undefined}>{ch}</span>
            </div>
            <select
              className={`border border-gray-300 rounded p-1 text-sm flex-1 ${disabledSelect ? 'bg-green-50 cursor-not-allowed' : ''}`}
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

export default CandidateSelectorFixed;
