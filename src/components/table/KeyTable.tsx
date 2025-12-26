import React, { useEffect, useMemo } from 'react';
import type { KeyTableProps } from '../types';
import { buildShiftOnlyColumns as buildColumns } from '../../utils/shiftMapping';
import { computePairsFromColumns, aggregatePairsByOT } from '../../utils/columns';
import { getGroupSize } from '../../utils/parseStrategies';
import padlock from '../../assets/icons/padlock.png';
import highlighter from '../../assets/icons/highlighter.png';
import { colors } from '../../utils/colors';



// (Removed proportional distributeRow; KeyTable mirrors deterministic mapping)

/**
 * KeyTable displays the reconstructed nomenclator key pairs OT → ZT.
 *
 * - Computes pairs by walking the same allocation that MappingTable uses (rowGroups or proportional fallback).
 * - Aggregates by OT character; in 'single' mode it displays only the first key but still detects violations if multiple unique keys exist.
 * - Supports locking (ot -> zt) and highlights violations (multiple keys in 'single' mode, or mismatch with lock).
 */
const KeyTable: React.FC<KeyTableProps & { columns?: Array<Array<{ ot: { ch: string } | null; zt: number[] }>> }> = ({ otRows, ztTokens, keysPerOTMode = 'multiple', lockedKeys, onLockOT, onUnlockOT, onLockAll, selections, ztParseMode = 'separator', groupSize = 1, columns, highlightedOTChar, onToggleHighlightOT }) => {
  // Use shared columns if provided; otherwise fallback to previous behavior for compatibility
  const colsForMode = useMemo(() => {
    if (columns && columns.length) return columns as Array<Array<{ ot: { ch: string } | null; zt: number[] }>>;
    const gs = getGroupSize(ztParseMode, groupSize);
    return buildColumns(otRows, ztTokens, lockedKeys, selections, gs);
  }, [columns, otRows, ztTokens, lockedKeys, selections, ztParseMode, groupSize]);

  const pairs = useMemo(() => computePairsFromColumns(colsForMode, ztTokens, getGroupSize(ztParseMode, groupSize)), [colsForMode, ztTokens, ztParseMode, groupSize]);

  // Track OT chars that have at least one empty mapped cell.
  // This is separate from the aggregated display (which can omit empty entries
  // when a non-empty key exists) but still represents an error state in the grid.
  const hasEmptyCellByOT = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const p of pairs) {
      if (p.zt === '') map[p.ot] = true;
    }
    return map;
  }, [pairs]);

  // Aggregate by OT character: collect ZT groups
  const aggregated = useMemo(() => aggregatePairsByOT(pairs, keysPerOTMode), [pairs, keysPerOTMode]);

  // Abecedné zoradenie podľa OT znaku
  const sortedAggregated = useMemo(() => {
    return [...aggregated].sort((a, b) => a.ot.localeCompare(b.ot));
  }, [aggregated]);

  const errorByOT = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const row of sortedAggregated) {
      const uniqueCount = (row as { uniqueCount?: number; ztList: string[] }).uniqueCount ?? row.ztList.length;
      const isViolationSingle = keysPerOTMode === 'single' && uniqueCount > 1;
      const isLocked = !!lockedKeys && typeof lockedKeys[row.ot] === 'string';
      const lockedMismatch = isLocked && row.ztList.length > 0 && lockedKeys![row.ot] !== row.ztList[0];
      const hasEmptyCell = Boolean(hasEmptyCellByOT[row.ot]);
      out[row.ot] = Boolean(isViolationSingle || lockedMismatch || row.ztList.length === 0 || hasEmptyCell);
    }
    return out;
  }, [hasEmptyCellByOT, keysPerOTMode, lockedKeys, sortedAggregated]);

  // If a previously-highlighted OT is no longer eligible for the highlight icon,
  // automatically turn off the highlight so cells don't stay highlighted.
  useEffect(() => {
    if (!highlightedOTChar) return;
    if (!onToggleHighlightOT) return;
    if (errorByOT[highlightedOTChar]) return;
    onToggleHighlightOT(highlightedOTChar);
  }, [errorByOT, highlightedOTChar, onToggleHighlightOT]);

  if (sortedAggregated.length === 0) return <div className="text-sm text-gray-500">(no pairs)</div>;

  // Determine if there are any violations (errors) and compute bulk locks
  let hasError = false;
  const bulkLocks: Record<string, string> = {};
  for (const row of sortedAggregated) {
    if (errorByOT[row.ot]) {
      hasError = true;
    }
    if (row.ztList.length > 0) {
      bulkLocks[row.ot] = row.ztList[0];
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
        <div className="text-sm font-medium text-gray-700">Key pairs</div>
        {onLockAll && (
          <button
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => onLockAll && onLockAll(bulkLocks)}
            disabled={hasError}
            title={hasError ? 'Fix errors first (multiple keys / lock mismatch / empty ZT)' : 'Lock all OT → ZT according to table'}
          >
            Lock all
          </button>
        )}
      </div>
      <table className="w-full text-sm table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">OT</th>
            <th className="text-left px-3 py-2">ZT</th>
            <th className="text-left px-3 py-2 w-24">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {sortedAggregated.map((row) => {
            // violation rules for keysPerOTMode='single': more than one unique or lock mismatch
            const uniqueCount = (row as { uniqueCount?: number; ztList: string[] }).uniqueCount ?? row.ztList.length;
            const isViolationSingle = keysPerOTMode === 'single' && uniqueCount > 1;
            const isLocked = !!lockedKeys && typeof lockedKeys[row.ot] === 'string';
            const lockedMismatch = isLocked && row.ztList.length > 0 && lockedKeys![row.ot] !== row.ztList[0];
            const hasEmptyCell = Boolean(hasEmptyCellByOT[row.ot]);
            const isRowError = Boolean(errorByOT[row.ot]);
            const trClass = isRowError ? 'bg-red-50' : '';
            return (
              <tr key={row.ot} className={`border-t border-gray-100 ${trClass}`}>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{row.ot}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">
                  <span className="whitespace-nowrap">{(row.ztList.length ? row.ztList.join(' ') : '—') || '—'}</span>
                  {isViolationSingle && <span className="ml-2 text-red-600">(multiple keys)</span>}
                  {lockedMismatch && <span className="ml-2 text-red-600">(lock mismatch)</span>}
                  {hasEmptyCell && <span className="ml-2 text-red-600">(missing)</span>}
                </td>
                <td className="px-3 py-2">
                  {onLockOT || onUnlockOT ? (
                    <>
                      {isLocked ? (
                        <button
                          className={`text-xs px-2 py-1 rounded ${colors.lockedBtn}`}
                          onClick={() => onUnlockOT && onUnlockOT(row.ot)}
                          title={`Unlock ${row.ot}`}
                          aria-label={`Unlock ${row.ot}`}
                          aria-pressed={true}
                        >
                          <img src={padlock} alt="" aria-hidden="true" className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          className={`text-xs px-2 py-1 rounded ${colors.unlockedBtn}`}
                          onClick={() => onLockOT && row.ztList.length > 0 && onLockOT(row.ot, row.ztList[0])}
                          disabled={isRowError || row.ztList.length === 0}
                          title={isRowError ? 'Fix the red error state first' : (row.ztList.length ? `Lock ${row.ot} = ${row.ztList[0]}` : 'Nothing to lock')}
                          aria-label={isRowError ? `Cannot lock ${row.ot} while errors exist` : (row.ztList.length ? `Lock ${row.ot} to ${row.ztList[0]}` : `Nothing to lock for ${row.ot}`)}
                          aria-pressed={false}
                        >
                          <img src={padlock} alt="" aria-hidden="true" className="w-4 h-4" />
                        </button>
                      )}
                        {/* Highlighter icon shown for error rows */}
                        { isRowError && onToggleHighlightOT ? (
                          <button
                            className={`ml-2 inline-flex items-center justify-center w-7 h-7 rounded ${highlightedOTChar === row.ot ? 'bg-purple-600 text-white' : 'text-purple-600 hover:bg-purple-50'}`}
                            onClick={() => onToggleHighlightOT(row.ot)}
                            title={`Highlight OT ${row.ot}`}
                            aria-label={`Highlight OT ${row.ot}`}
                            aria-pressed={highlightedOTChar === row.ot}
                          >
                            <img src={highlighter} alt="" aria-hidden="true" className="w-4 h-4" />
                          </button>
                        ) : null}
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default KeyTable;
