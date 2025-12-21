import React from 'react';
import { buildCandidateOptions } from './candidateHelpers';

type Props = {
  candidatesByChar: Record<string, any[]>;
  lockedKeys: Record<string, string>;
  selections: Record<string, any>;
  setSelections: any;
  otRows: any[];
  effectiveZtTokens: any[];
  fixedLength: number;
  reservedTokens: Set<string>;
  sharedColumns: any;
};

const CandidateSelectorFixed: React.FC<Props> = ({ candidatesByChar, lockedKeys, selections, setSelections, otRows, effectiveZtTokens, fixedLength, reservedTokens, sharedColumns }) => {
  const groupSize = Math.max(1, fixedLength || 1);

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
              <span className={`inline-block px-2 py-0.5 rounded border ${lockedVal ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`} title={lockedVal ? `Zamknuté: ${lockedVal}` : undefined}>{ch}</span>
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
              <option value="">None</option>
              {sortedByScore.filter((c:any) => c.length === 1).map((c:any, idx:number) => {
                const opt = buildCandidateOptions({ c, idx, ch, otRows, effectiveZtTokens, groupSize, reservedTokens, selectionVal, lockedVal, sharedColumns });
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
