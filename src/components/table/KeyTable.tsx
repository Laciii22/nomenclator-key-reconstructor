import React, { useEffect, useMemo } from 'react';
import type { KeyTableProps } from '../types';
import { buildShiftOnlyColumns as buildColumns } from '../../utils/shiftMapping';
import { computePairsFromColumns, aggregatePairsByOT } from '../../utils/columns';
import { getGroupSize } from '../../utils/parseStrategies';
import padlock from '../../assets/icons/padlock.png';
import highlighter from '../../assets/icons/highlighter.png';
import { colors } from '../../utils/colors';
import { normalizeToArray } from '../../utils/multiKeyHelpers';



type SharedColumns = Array<Array<{ ot: { ch: string } | null; zt: number[] }>>;

/**
 * KeyTable displays the reconstructed nomenclator key pairs OT → ZT.
 *
 * - Computes pairs by walking the same allocation that MappingTable uses (rowGroups or proportional fallback).
 * - Aggregates by OT character; in 'single' mode it displays only the first key but still detects violations if multiple unique keys exist.
 * - In 'multiple' mode, it displays all homophone tokens for each character.
 * - Supports locking (ot -> zt) and highlights violations (multiple keys in 'single' mode, or mismatch with lock).
 */
const KeyTable: React.FC<KeyTableProps & { columns?: Array<Array<{ ot: { ch: string } | null; zt: number[] }>>; onQuickAssign?: (otPattern: string, ztToken: string) => string | null }> = ({ otRows, ztTokens, keysPerOTMode = 'multiple', lockedKeys, onLockOT, onUnlockOT, onLockAll, selections, ztParseMode = 'separator', groupSize = 1, columns, highlightedOTChar, onToggleHighlightOT, onQuickAssign }) => {
  // Use shared columns if provided; otherwise fallback to previous behavior for compatibility
  const colsForMode = useMemo(() => {
    if (columns && columns.length) return columns as SharedColumns;
    const gs = getGroupSize(ztParseMode, groupSize);
    
    // Normalize to single-key format for buildColumns
    const normalizedLocks: Record<string, string> = {};
    if (lockedKeys) {
      for (const [ch, val] of Object.entries(lockedKeys)) {
        normalizedLocks[ch] = Array.isArray(val) ? val[0] || '' : val;
      }
    }
    
    const normalizedSelections: Record<string, string | null> = {};
    if (selections) {
      for (const [ch, val] of Object.entries(selections)) {
        normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
      }
    }
    
    return buildColumns(otRows, ztTokens, normalizedLocks, normalizedSelections, gs);
  }, [columns, otRows, ztTokens, lockedKeys, selections, ztParseMode, groupSize]);

  const pairs = useMemo(() => computePairsFromColumns(colsForMode, ztTokens, getGroupSize(ztParseMode, groupSize), keysPerOTMode), [colsForMode, ztTokens, ztParseMode, groupSize, keysPerOTMode]);

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

  // Quick Assign state
  const [quickOtPattern, setQuickOtPattern] = React.useState('');
  const [quickZtToken, setQuickZtToken] = React.useState('');
  const [quickAssignError, setQuickAssignError] = React.useState<string | null>(null);

  const handleQuickAssign = React.useCallback(() => {
    if (!onQuickAssign) return;
    
    const error = onQuickAssign(quickOtPattern, quickZtToken);
    if (error) {
      setQuickAssignError(error);
    } else {
      // Success - clear fields and error
      setQuickOtPattern('');
      setQuickZtToken('');
      setQuickAssignError(null);
    }
  }, [onQuickAssign, quickOtPattern, quickZtToken]);

  const handleOtPatternChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuickOtPattern(e.target.value.toUpperCase());
    setQuickAssignError(null); // Clear error on input change
  }, []);

  const handleZtTokenChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuickZtToken(e.target.value);
    setQuickAssignError(null); // Clear error on input change
  }, []);

  // Duplicate displayed ZT keys across different OT characters.
  // This matches what the KeyTable shows (and what users reason about).
  const duplicateKeyByOT = useMemo(() => {
    const tokenToOTs: Record<string, Set<string>> = {};
    for (const row of sortedAggregated) {
      const primary = row.ztList?.[0] ?? '';
      const token = typeof primary === 'string' ? primary.trim() : '';
      if (!token) continue;
      (tokenToOTs[token] ||= new Set()).add(row.ot);
    }

    const dupTokenByOT: Record<string, string> = {};
    for (const [token, ots] of Object.entries(tokenToOTs)) {
      if (ots.size <= 1) continue;
      for (const ot of ots) dupTokenByOT[ot] = token;
    }
    return dupTokenByOT;
  }, [sortedAggregated]);

  const errorByOT = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const row of sortedAggregated) {
      const uniqueCount = (row as { uniqueCount?: number; ztList: string[] }).uniqueCount ?? row.ztList.length;
      const isViolationSingle = keysPerOTMode === 'single' && uniqueCount > 1;
      const lockedTokens = normalizeToArray(lockedKeys?.[row.ot]);
      const isLocked = lockedTokens.length > 0;
      
      let lockedMismatch = false;
      if (isLocked && row.ztList.length > 0) {
        if (keysPerOTMode === 'multiple') {
          // In multi-key mode, check if all locked tokens are in the ztList
          lockedMismatch = !lockedTokens.every(lt => row.ztList.includes(lt));
        } else {
          // In single-key mode, check if the first token matches
          lockedMismatch = lockedTokens[0] !== row.ztList[0];
        }
      }
      
      const hasEmptyCell = Boolean(hasEmptyCellByOT[row.ot]);
      const hasDuplicateChosenKey = keysPerOTMode === 'single' && typeof duplicateKeyByOT[row.ot] === 'string';
      
      // Check for invalid token length in fixed-length mode
      let hasInvalidLength = false;
      if (ztParseMode === 'fixedLength' && groupSize > 1) {
        hasInvalidLength = row.ztList.some(token => token.length !== groupSize);
      }
      
      out[row.ot] = Boolean(isViolationSingle || lockedMismatch || row.ztList.length === 0 || hasEmptyCell || hasDuplicateChosenKey || hasInvalidLength);
    }
    return out;
  }, [duplicateKeyByOT, hasEmptyCellByOT, keysPerOTMode, lockedKeys, sortedAggregated, ztParseMode, groupSize]);

  // If a previously-highlighted OT is no longer eligible for the highlight icon,
  // automatically turn off the highlight so cells don't stay highlighted.
  useEffect(() => {
    if (!highlightedOTChar) return;
    if (!onToggleHighlightOT) return;
    if (errorByOT[highlightedOTChar]) return;
    // The highlighter is an "error navigation" affordance; once the error condition
    // is gone, keeping the highlight on becomes distracting.
    onToggleHighlightOT(highlightedOTChar);
  }, [errorByOT, highlightedOTChar, onToggleHighlightOT]);

  if (sortedAggregated.length === 0) return <div className="text-sm text-gray-500">(no pairs)</div>;

  // Determine if there are any violations (errors) and compute bulk locks
  let hasError = false;
  const bulkLocks: Record<string, string | string[]> = {};
  for (const row of sortedAggregated) {
    if (errorByOT[row.ot]) {
      hasError = true;
    }
    if (row.ztList.length > 0) {
      if (keysPerOTMode === 'multiple') {
        bulkLocks[row.ot] = row.ztList; // All tokens
      } else {
        bulkLocks[row.ot] = row.ztList[0]; // First token only
      }
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Quick Assign Section */}
      {onQuickAssign && (
        <div className="px-3 py-3 bg-gray-50 border-b border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-2">Quick Assign</div>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                type="text"
                placeholder="OT pattern (e.g. PES)"
                value={quickOtPattern}
                onChange={handleOtPatternChange}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="ZT token (e.g. 66)"
                value={quickZtToken}
                onChange={handleZtTokenChange}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleQuickAssign}
              disabled={!quickOtPattern || !quickZtToken}
              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              title="Merge and assign OT pattern to ZT token"
            >
              Assign
            </button>
          </div>
          {quickAssignError && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {quickAssignError}
            </div>
          )}
        </div>
      )}

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
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2 w-16">OT</th>
            <th className="text-left px-3 py-2">ZT</th>
            <th className="text-left px-3 py-2 w-24">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {sortedAggregated.map((row) => {
            // violation rules for keysPerOTMode='single': more than one unique or lock mismatch
            const uniqueCount = (row as { uniqueCount?: number; ztList: string[] }).uniqueCount ?? row.ztList.length;
            const isViolationSingle = keysPerOTMode === 'single' && uniqueCount > 1;
            const lockedTokens = normalizeToArray(lockedKeys?.[row.ot]);
            const isLocked = lockedTokens.length > 0;
            
            let lockedMismatch = false;
            if (isLocked && row.ztList.length > 0) {
              if (keysPerOTMode === 'multiple') {
                lockedMismatch = !lockedTokens.every(lt => row.ztList.includes(lt));
              } else {
                lockedMismatch = lockedTokens[0] !== row.ztList[0];
              }
            }
            
            const hasEmptyCell = Boolean(hasEmptyCellByOT[row.ot]);
            const hasDuplicateChosenKey = keysPerOTMode === 'single' && typeof duplicateKeyByOT[row.ot] === 'string';
            
            // Check for invalid token length in fixed-length mode
            let hasInvalidLength = false;
            if (ztParseMode === 'fixedLength' && groupSize > 1) {
              hasInvalidLength = row.ztList.some(token => token.length !== groupSize);
            }
            
            const isRowError = Boolean(errorByOT[row.ot]);
            const trClass = isRowError ? 'bg-red-50' : '';
            return (
              <tr key={row.ot} className={`border-t border-gray-100 ${trClass}`}>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{row.ot}</td>
                <td className="px-3 py-2 font-mono">
                  {keysPerOTMode === 'multiple' && row.ztList.length > 0 ? (
                    <div>
                      <div className="flex flex-wrap gap-1">
                        {row.ztList.map((zt, idx) => {
                          const isLockedToken = lockedTokens.includes(zt);
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs ${
                                isLockedToken
                                  ? 'bg-green-100 text-green-800 border border-green-300'
                                  : 'bg-gray-100 text-gray-800 border border-gray-300'
                              }`}
                              title={isLockedToken ? 'Locked' : undefined}
                            >
                              {zt}
                              {isLockedToken && <img src={padlock} alt="Locked" className="w-2 h-2" />}
                            </span>
                          );
                        })}
                        {row.ztList.length > 1 && (
                          <span className="text-xs text-gray-500 self-center">
                            ({row.ztList.length} homophones)
                          </span>
                        )}
                      </div>
                      {/* Error messages for multi-key mode */}
                      {(lockedMismatch || hasEmptyCell || hasInvalidLength) && (
                        <div className="mt-1 text-xs text-red-600">
                          {lockedMismatch && <div>(lock mismatch)</div>}
                          {hasEmptyCell && <div>(missing)</div>}
                          {hasInvalidLength && <div>(invalid length)</div>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="whitespace-nowrap">{(row.ztList.length ? row.ztList.join(' ') : '—') || '—'}</span>
                      {isViolationSingle && <span className="ml-2 text-red-600">(multiple keys)</span>}
                      {lockedMismatch && <span className="ml-2 text-red-600">(lock mismatch)</span>}
                      {hasEmptyCell && <span className="ml-2 text-red-600">(missing)</span>}
                      {hasDuplicateChosenKey && <span className="ml-2 text-red-600">(duplicate)</span>}
                      {hasInvalidLength && <span className="ml-2 text-red-600">(invalid length)</span>}
                    </>
                  )}
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
                          onClick={() => {
                            if (!onLockOT || row.ztList.length === 0) return;
                            if (keysPerOTMode === 'multiple') {
                              // Lock all tokens for this character
                              row.ztList.forEach(zt => onLockOT(row.ot, zt));
                            } else {
                              // Lock first token only
                              onLockOT(row.ot, row.ztList[0]);
                            }
                          }}
                          disabled={isRowError || row.ztList.length === 0}
                          title={isRowError ? 'Fix the red error state first' : (row.ztList.length ? `Lock ${row.ot}` : 'Nothing to lock')}
                          aria-label={isRowError ? `Cannot lock ${row.ot} while errors exist` : (row.ztList.length ? `Lock ${row.ot}` : `Nothing to lock for ${row.ot}`)}
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
                            <img src={highlighter} alt="highlight" aria-hidden="true" className="w-4 h-4" />
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

KeyTable.displayName = 'KeyTable';

export default React.memo(KeyTable);

