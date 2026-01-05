/**
 * CandidateSelectorMulti: Multi-key (homophone) mode candidate selector.
 * 
 * Allows users to select multiple ZT tokens per OT character using checkboxes.
 * Features:
 * - Checkbox-based selection (instead of radio/dropdown)
 * - Visual indicators for locked tokens
 * - Reserved token validation
 * - Score-based sorting
 * - Homophone count display
 */

import React from 'react';
import { buildCandidateOptions } from './candidateHelpers';
import type { SelectionMap, Candidate } from '../../utils/analyzer';
import type { OTChar, ZTToken } from '../../types/domain';
import type { Column } from '../types';
import { normalizeToArray } from '../../utils/multiKeyHelpers';

/**
 * Check if token is already selected for a different OT character.
 */
function isTokenSelectedElsewhere(
  token: string,
  currentChar: string,
  selections: SelectionMap
): boolean {
  for (const [otherCh, otherSel] of Object.entries(selections)) {
    if (otherCh !== currentChar && Array.isArray(otherSel) && otherSel.includes(token)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if character has reached maximum allowed token selections.
 * Returns true if any selected token covers all occurrences.
 */
function isAtMaxSelections(
  selectedTokens: string[],
  candidateList: Candidate[]
): boolean {
  for (const token of selectedTokens) {
    const candidate = candidateList.find(x => x.token === token);
    if (candidate?.occurrences && candidate.support === candidate.occurrences) {
      return true;
    }
  }
  return false;
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
      extended.unshift({
        token,
        length: 1,
        support: 0,
        occurrences: 0,
        score: 1
      });
    }
  }
  
  return extended;
}

/**
 * Sort candidates by score (descending), then alphabetically.
 */
function sortCandidatesByScore(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.token.localeCompare(b.token);
  });
}

interface CandidateSelectorMultiProps {
  candidatesByChar: Record<string, Candidate[]>;
  lockedKeys: Record<string, string | string[]>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  otRows: OTChar[][];
  effectiveZtTokens: ZTToken[];
  reservedTokens: Set<string>;
  sharedColumns: Column[][];
}

/**
 * Candidate selector for multi-key (homophone) mode.
 * Displays checkboxes for selecting multiple tokens per OT character.
 */
const CandidateSelectorMulti: React.FC<CandidateSelectorMultiProps> = ({
  candidatesByChar,
  lockedKeys,
  selections,
  setSelections,
  otRows,
  effectiveZtTokens,
  reservedTokens,
  sharedColumns
}) => {
  const handleToggleToken = React.useCallback((char: string, token: string) => {
    setSelections(prev => {
      const currentArr = normalizeToArray(prev[char]);
      const hasIt = currentArr.includes(token);
      
      const nextArr = hasIt
        ? currentArr.filter(t => t !== token)
        : [...currentArr, token];
      
      return {
        ...prev,
        [char]: nextArr.length > 0 ? nextArr : null
      };
    });
  }, [setSelections]);

  return (
    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Object.entries(candidatesByChar)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([ch, list]) => {
          const lockedTokens = normalizeToArray(lockedKeys[ch]);
          const selectedTokens = normalizeToArray(selections[ch]);
          const allTokens = new Set([...lockedTokens, ...selectedTokens]);
          
          const extendedList = extendCandidateList(list, lockedTokens);
          const sortedByScore = sortCandidatesByScore(extendedList);
          const isLocked = lockedTokens.length > 0;

          return (
            <div key={ch} className="border rounded-lg p-2 bg-white shadow-sm">
              {/* Header with OT character */}
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded font-mono font-semibold text-base ${
                      isLocked
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                    }`}
                    title={isLocked ? `Locked: ${lockedTokens.join(', ')}` : undefined}
                  >
                    {ch}
                  </span>
                </div>
                {allTokens.size > 0 && (
                  <div className="text-xs text-gray-600">
                    {allTokens.size} homophone{allTokens.size > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Candidate checkboxes */}
              <div className="space-y-1">
                {sortedByScore.slice(0, 6).map((c, idx) => {
                  const token = c.token;
                  const isLockedToken = lockedTokens.includes(token);
                  const isSelectedToken = selectedTokens.includes(token);
                  const isChecked = isLockedToken || isSelectedToken;

                  const isSelectedElsewhere = isTokenSelectedElsewhere(token, ch, selections);
                  const coversAll = isAtMaxSelections(selectedTokens, extendedList);
                  const maxAllowed = c.occurrences || 1;
                  const selectedCount = selectedTokens.length;
                  const isAtMax = !isChecked && (selectedCount >= maxAllowed || coversAll);

                  const isReservedElsewhere = 
                    reservedTokens.has(token) && 
                    !isLockedToken && 
                    !isSelectedToken;

                  const opt = buildCandidateOptions({
                    c,
                    idx,
                    ch,
                    otRows,
                    effectiveZtTokens,
                    groupSize: 1,
                    reservedTokens,
                    selectionVal: Array.isArray(selectedTokens) ? selectedTokens[0] : null,
                    lockedVal: Array.isArray(lockedTokens) && lockedTokens.length > 0 ? lockedTokens[0] : undefined,
                    sharedColumns
                  });

                  return (
                    <label
                      key={idx}
                      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                        isLockedToken
                          ? 'bg-green-50 border border-green-200'
                          : isSelectedToken
                            ? 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
                            : isReservedElsewhere || isSelectedElsewhere || isAtMax
                              ? 'bg-gray-50 border border-gray-200 opacity-50 cursor-not-allowed'
                              : 'hover:bg-gray-50 border border-transparent'
                      }`}
                      title={opt.title}
                    >
                      <input
                        type="checkbox"
                        className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                        checked={isChecked}
                        disabled={isLockedToken || isReservedElsewhere || isSelectedElsewhere || isAtMax}
                        onChange={() => handleToggleToken(ch, token)}
                      />
                      <div className="flex-1 flex items-center justify-between text-sm">
                        <span className="font-mono font-medium">{token}</span>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span title="Score">
                            {c.score.toFixed(2)}
                          </span>
                          <span title="Support / Occurrences">
                            ({c.support}/{c.occurrences})
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Show locked tokens info */}
              {isLocked && (
                <div className="mt-2 pt-1.5 border-t text-xs text-green-700 bg-green-50 rounded p-1.5">
                  <strong>Locked:</strong> {lockedTokens.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(CandidateSelectorMulti);
