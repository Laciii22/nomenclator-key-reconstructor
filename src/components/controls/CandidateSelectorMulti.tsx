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
import { Grid } from 'react-window';
import { buildCandidateOptions, buildPTCharFlatIndexMap, countTotalDeceptionTokens } from './candidateHelpers';
import { sortCandidatesByScore } from './candidateSelectorCommon';
import { buildOccMap } from '../../utils/parseStrategies';
import type { SelectionMap, Candidate } from '../../utils/analyzer';
import type { PTChar, CTToken } from '../../types/domain';
import type { Column } from '../types';
import { normalizeToArray } from '../../utils/multiKeyHelpers';
import { useViewportWidth } from '../../hooks/useViewportWidth';

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
const CARD_HEIGHT = 272;
const MIN_CARD_WIDTH = 240;

function getColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 4;
  if (viewportWidth >= 1024) return 3;
  if (viewportWidth >= 768) return 2;
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
  const viewportWidth = useViewportWidth(120);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = React.useState(0);

  React.useEffect(() => {
    const next = containerRef.current?.clientWidth ?? 0;
    if (next > 0 && next !== gridWidth) setGridWidth(next);
  }, [viewportWidth, gridWidth]);

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

  const cardModels = React.useMemo(() => {
    return charEntries.map(([ch]) => {
      const lockedTokens = normalizeToArray(lockedKeys[ch]);
      const selectedTokens = normalizeToArray(selections[ch]);
      const allTokens = new Set([...lockedTokens, ...selectedTokens]);
      const sortedByScore = sortedCandidatesByChar[ch] ?? [];
      const isLocked = lockedTokens.length > 0;
      return {
        ch,
        lockedTokens,
        selectedTokens,
        allTokensCount: allTokens.size,
        sortedByScore,
        isLocked,
      };
    });
  }, [charEntries, lockedKeys, selections, sortedCandidatesByChar]);

  const columnCount = React.useMemo(
    () => getColumnCount(viewportWidth),
    [viewportWidth],
  );
  const rowCount = React.useMemo(
    () => Math.ceil(cardModels.length / columnCount),
    [cardModels.length, columnCount],
  );

  const columnWidth = React.useMemo(() => {
    if (!gridWidth) return MIN_CARD_WIDTH;
    return Math.max(MIN_CARD_WIDTH, Math.floor(gridWidth / columnCount));
  }, [gridWidth, columnCount]);

  const handleToggleToken = React.useCallback((char: string, token: string) => {
    setSelections(prev => {
      const currentArr = normalizeToArray(prev[char]);
      const hasIt = currentArr.includes(token);
      const nextArr = hasIt
        ? currentArr.filter(t => t !== token)
        : [...currentArr, token];
      return { ...prev, [char]: nextArr.length > 0 ? nextArr : null };
    });
  }, [setSelections]);

  const Cell = React.useCallback(({ columnIndex, rowIndex, style, ariaAttributes }: {
    columnIndex: number;
    rowIndex: number;
    style: React.CSSProperties;
    ariaAttributes: { 'aria-colindex': number; role: 'gridcell' };
  }) => {
    const flatIndex = rowIndex * columnCount + columnIndex;
    if (flatIndex >= cardModels.length) return <div style={style} {...ariaAttributes} />;

    const model = cardModels[flatIndex];

    return (
      <div style={{ ...style, padding: '6px' }} {...ariaAttributes}>
        <div className="border rounded-lg p-2 bg-white shadow-sm h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b">
            <span
              className={`inline-block px-2 py-0.5 rounded font-mono font-semibold text-base ${
                model.isLocked
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
              }`}
              title={model.isLocked ? `Locked: ${model.lockedTokens.join(', ')}` : undefined}
            >
              {model.ch}
            </span>
            {model.allTokensCount > 0 && (
              <div className="text-xs text-gray-600">
                {model.allTokensCount} homophone{model.allTokensCount > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Candidate checkboxes — all candidates, no artificial cap */}
          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {model.sortedByScore.map((c, idx) => {
              const token = c.token;
              const isLockedToken = model.lockedTokens.includes(token);
              const isSelectedToken = model.selectedTokens.includes(token);
              const isChecked = isLockedToken || isSelectedToken;
              const isUsedElsewhere = isTokenUsedElsewhere(token, model.ch, tokenOwners);
              const isReservedElsewhere =
                reservedTokens.has(token) && !isLockedToken && !isSelectedToken;

              const opt = buildCandidateOptions({
                c,
                idx,
                ch: model.ch,
                ptRows,
                effectiveCtTokens,
                groupSize: 1,
                reservedTokens,
                selectionVal: model.selectedTokens[0] ?? null,
                lockedVal: model.lockedTokens[0],
                sharedColumns,
                _occMap: occMap,
                _ptCharFlatIndexMap: ptCharFlatIndexMap,
                _deceptionCount: deceptionCount,
              });

              const isDisabled = isLockedToken || isReservedElsewhere || isUsedElsewhere;

              return (
                <label
                  key={idx}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                    isLockedToken
                      ? 'bg-green-50 border border-green-200'
                      : isSelectedToken
                        ? 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
                        : isDisabled
                          ? 'bg-gray-50 border border-gray-200 opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-50 border border-transparent'
                  }`}
                  title={isUsedElsewhere ? 'Already used for another PT character' : opt.title}
                >
                  <input
                    type="checkbox"
                    className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => handleToggleToken(model.ch, token)}
                  />
                  <div className="flex-1 flex items-center justify-between text-sm">
                    <span className="font-mono font-medium">{token}</span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span title="Score">{c.score.toFixed(2)}</span>
                      <span title="Support / Occurrences">({c.support}/{c.occurrences})</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Locked tokens summary */}
          {model.isLocked && (
            <div className="mt-2 pt-1.5 border-t text-xs text-green-700 bg-green-50 rounded p-1.5">
              <strong>Locked:</strong> {model.lockedTokens.join(', ')}
            </div>
          )}
        </div>
      </div>
    );
  }, [
    cardModels,
    columnCount,
    tokenOwners,
    reservedTokens,
    ptRows,
    effectiveCtTokens,
    sharedColumns,
    occMap,
    ptCharFlatIndexMap,
    deceptionCount,
    handleToggleToken,
  ]);

  return (
    <div ref={containerRef} className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
      <Grid
        columnCount={columnCount}
        columnWidth={columnWidth}
        rowCount={rowCount}
        rowHeight={CARD_HEIGHT}
        cellComponent={Cell}
        cellProps={{}}
        style={{
          width: '100%',
          height: OUTER_HEIGHT,
        }}
      />
    </div>
  );
};

export default React.memo(CandidateSelectorMulti);
