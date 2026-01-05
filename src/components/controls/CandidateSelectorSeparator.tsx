import React from 'react';
import { buildCandidateOptions } from './candidateHelpers';
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
        const currentValue = selectionVal ?? lockedVal ?? '';
        const disabledSelect = Boolean(lockedVal);
        const extendedList = [...list];
        if (lockedVal && !extendedList.some(c => c.token === lockedVal)) {
          extendedList.unshift({ token: lockedVal, length: 1, support: 0, occurrences: 0, score: 1 });
        }
        const sortedByScore = extendedList.sort((a:any,b:any)=> {
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
