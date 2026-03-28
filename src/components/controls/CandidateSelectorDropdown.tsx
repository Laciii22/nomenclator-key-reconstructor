/**
 * Shared single-key candidate selector grid.
 *
 * Renders a dropdown per PT character, sorted alphabetically, with score-sorted
 * candidates. Used by both Fixed and Separator modes — the only differences
 * are `groupSize` and the empty-option label text.
 */

import React from 'react';
import { Grid } from 'react-window';
import { buildCandidateOptions, buildPTCharFlatIndexMap, countTotalDeceptionTokens } from './candidateHelpers';
import { buildOccMap } from '../../utils/parseStrategies';
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
import { useViewportWidth } from '../../hooks/useViewportWidth';

const OUTER_HEIGHT = 384; // max-h-96
const ROW_HEIGHT = 62;
const MIN_CELL_WIDTH = 260;

function getColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 3;
  if (viewportWidth >= 768) return 2;
  return 1;
}

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

  const sortedCandidatesByChar = React.useMemo(() => {
    const result: Record<string, Candidate[]> = {};
    for (const [ch, list] of charEntries) {
      const lockedVal = lockedKeys[ch];
      const extendedList = extendCandidateListWithLocked(list, lockedVal);
      result[ch] = sortCandidatesByScore(extendedList).filter((c) => c.length === 1);
    }
    return result;
  }, [charEntries, lockedKeys]);

  const rowCount = React.useMemo(() => {
    const columns = getColumnCount(viewportWidth);
    return Math.ceil(charEntries.length / columns);
  }, [charEntries.length, viewportWidth]);

  const columnCount = React.useMemo(
    () => getColumnCount(viewportWidth),
    [viewportWidth],
  );

  const columnWidth = React.useMemo(() => {
    if (!gridWidth) return MIN_CELL_WIDTH;
    return Math.max(MIN_CELL_WIDTH, Math.floor(gridWidth / columnCount));
  }, [gridWidth, columnCount]);

  const gridCellProps = React.useMemo(() => ({}), []);

  const totalChars = Object.keys(candidatesByChar).length;
  const assignedChars = Object.entries(candidatesByChar).filter(([ch]) => lockedKeys[ch] || selections[ch]).length;

  const Cell = React.useCallback(({ columnIndex, rowIndex, style, ariaAttributes }: {
    columnIndex: number;
    rowIndex: number;
    style: React.CSSProperties;
    ariaAttributes: { 'aria-colindex': number; role: 'gridcell' };
  }) => {
    const flatIndex = rowIndex * columnCount + columnIndex;
    if (flatIndex >= charEntries.length) return <div style={style} {...ariaAttributes} />;

    const ch = charEntries[flatIndex][0];
    const lockedVal = lockedKeys[ch];
    const selectionVal = selections[ch];
    const normalizedSelectionVal = Array.isArray(selectionVal) ? selectionVal[0] : (selectionVal ?? null);
    const currentValue = getCurrentSelectorValue(lockedVal, normalizedSelectionVal);
    const disabledSelect = Boolean(lockedVal);
    const sortedByScore = sortedCandidatesByChar[ch] ?? [];

    return (
      <div style={{ ...style, padding: '6px' }} {...ariaAttributes}>
        <div className="flex items-center gap-3 h-full">
          <div className="w-10 font-mono text-center shrink-0">
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
                <option key={idx} value={opt.token} disabled={opt.disabled} title={opt.title}>{opt.label}</option>
              );
            })}
          </select>
          {lockedVal && (
            <span className="text-xs text-green-700 shrink-0">locked: {lockedVal}</span>
          )}
        </div>
      </div>
    );
  }, [
    columnCount,
    charEntries,
    lockedKeys,
    selections,
    sortedCandidatesByChar,
    emptyOptionLabel,
    setSelections,
    ptRows,
    effectiveCtTokens,
    groupSize,
    reservedTokens,
    sharedColumns,
    occMap,
    ptCharFlatIndexMap,
    deceptionCount,
  ]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500">Assigned:</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          assignedChars === totalChars ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>{assignedChars} / {totalChars}</span>
      </div>
      <div ref={containerRef} className="overflow-hidden">
        <Grid
          columnCount={columnCount}
          columnWidth={columnWidth}
          rowCount={rowCount}
          rowHeight={ROW_HEIGHT}
          cellComponent={Cell}
          cellProps={gridCellProps}
          style={{
            width: '100%',
            height: OUTER_HEIGHT,
            overflowX: 'hidden',
            overflowY: 'auto',
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(CandidateSelectorDropdown);
