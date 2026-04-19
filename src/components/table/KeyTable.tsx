import React, { useEffect, useMemo } from 'react';
import type { KeyTableProps } from '../types';
import { buildShiftOnlyColumns as buildColumns } from '../../utils/shiftMapping';
import { computePairsFromColumns, aggregatePairsByOT } from '../../utils/columns';
import { getGroupSize } from '../../utils/parseStrategies';
import padlock from '../../assets/icons/padlock.png';
import highlighter from '../../assets/icons/highlighter.png';
import { colors } from '../../utils/colors';
import { normalizeToArray } from '../../utils/multiKeyHelpers';
import { normalizeLocks } from '../../utils/frequency';
import Modal from '../common/Modal';
import { downloadKeyAsJson } from '../../utils/exportKey';



type SharedColumns = Array<Array<{ pt: { ch: string } | null; ct: number[] }>>;

/**
 * KeyTable displays the reconstructed nomenclator key pairs PT → CT.
 *
 * - Computes pairs by walking the same allocation that MappingTable uses (rowGroups or proportional fallback).
 * - Aggregates by PT character; in 'single' mode it displays only the first key but still detects violations if multiple unique keys exist.
 * - In 'multiple' mode, it displays all homophone tokens for each character.
 * - Supports locking (pt -> ct) and highlights violations (multiple keys in 'single' mode, or mismatch with lock).
 */
const KeyTable: React.FC<KeyTableProps & {
  columns?: Array<Array<{ pt: { ch: string } | null; ct: number[] }>>;
  onQuickAssign?: (ptPattern: string, ctToken: string) => { error?: string; warning?: { ptCount: number; ctCount: number } } | null;
  onExecuteQuickAssign?: (ptPattern: string, ctToken: string) => string | null;
  bracketedIndices?: number[];
  uniqueCTTokenTexts?: { text: string; allBracketed: boolean }[];
}> = ({ ptRows, ctTokens, keysPerPTMode = 'multiple', lockedKeys, onLockOT, onUnlockOT, onLockAll, selections, ctParseMode = 'separator', groupSize = 1, columns, highlightedPTChar, onToggleHighlightOT, onQuickAssign, onExecuteQuickAssign, bracketedIndices = [], uniqueCTTokenTexts }) => {
  // Use shared columns if provided; otherwise fallback to previous behavior for compatibility
  const colsForMode = useMemo(() => {
    if (columns && columns.length) return columns as SharedColumns;
    const gs = getGroupSize(ctParseMode, groupSize);

    // Normalize to single-key format for buildColumns
    const normalizedLocks = normalizeLocks(lockedKeys);

    const normalizedSelections: Record<string, string | null> = {};
    if (selections) {
      for (const [ch, val] of Object.entries(selections)) {
        normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
      }
    }

    return buildColumns(ptRows, ctTokens, normalizedLocks, normalizedSelections, gs, bracketedIndices);
  }, [columns, ptRows, ctTokens, lockedKeys, selections, ctParseMode, groupSize, bracketedIndices]);

  // Prefer the canonical deception list coming from parsing (`uniqueCTTokenTexts`)
  // where `allBracketed === true`. Fall back to scanning columns for PT-null
  // cells for robustness.
  const deceptionList = React.useMemo(() => {
    if (uniqueCTTokenTexts && uniqueCTTokenTexts.length) {
      return uniqueCTTokenTexts.filter(u => u.allBracketed).map(u => u.text);
    }
    const set = new Set<string>();
    for (const row of colsForMode) {
      for (const col of row) {
        if (col.pt) continue;
        const text = col.ct.map((i: number) => ctTokens[i]?.text || '').join('');
        if (text) set.add(text);
      }
    }
    return Array.from(set);
  }, [uniqueCTTokenTexts, colsForMode, ctTokens]);
  const pairs = useMemo(() => computePairsFromColumns(colsForMode, ctTokens, keysPerPTMode), [colsForMode, ctTokens, keysPerPTMode]);

  // Track PT chars that have at least one empty mapped cell.
  // This is separate from the aggregated display (which can omit empty entries
  // when a non-empty key exists) but still represents an error state in the grid.
  const hasEmptyCellByOT = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const p of pairs) {
      if (p.ct === '') map[p.pt] = true;
    }
    return map;
  }, [pairs]);

  // Aggregate by PT character: collect CT groups
  const aggregated = useMemo(() => aggregatePairsByOT(pairs, keysPerPTMode), [pairs, keysPerPTMode]);

  // Abecedné zoradenie podľa PT znaku
  const sortedAggregated = useMemo(() => {
    return [...aggregated].sort((a, b) => a.pt.localeCompare(b.pt));
  }, [aggregated]);

  // Quick Assign state
  const [quickPtPattern, setQuickPtPattern] = React.useState('');
  const [quickCtToken, setQuickCtToken] = React.useState('');
  const [quickAssignError, setQuickAssignError] = React.useState<string | null>(null);
  const [showFrequencyWarning, setShowFrequencyWarning] = React.useState<{ ptCount: number; ctCount: number } | null>(null);

  const handleQuickAssign = React.useCallback(() => {
    if (!onQuickAssign) return;

    const result = onQuickAssign(quickPtPattern, quickCtToken);
    if (!result) {
      // Success with no warnings
      if (onExecuteQuickAssign) {
        const execError = onExecuteQuickAssign(quickPtPattern, quickCtToken);
        if (execError) {
          setQuickAssignError(execError);
        } else {
          // Clear fields on success
          setQuickPtPattern('');
          setQuickCtToken('');
          setQuickAssignError(null);
        }
      }
      return;
    }

    if (result.error) {
      setQuickAssignError(result.error);
      return;
    }

    if (result.warning) {
      // Show frequency warning modal
      setShowFrequencyWarning(result.warning);
      return;
    }
  }, [onQuickAssign, onExecuteQuickAssign, quickPtPattern, quickCtToken]);

  const handleConfirmFrequencyWarning = React.useCallback(() => {
    if (!onExecuteQuickAssign) return;

    const error = onExecuteQuickAssign(quickPtPattern, quickCtToken);
    if (error) {
      setQuickAssignError(error);
    } else {
      // Success - clear fields and error
      setQuickPtPattern('');
      setQuickCtToken('');
      setQuickAssignError(null);
    }
    setShowFrequencyWarning(null);
  }, [onExecuteQuickAssign, quickPtPattern, quickCtToken]);

  const handleCancelFrequencyWarning = React.useCallback(() => {
    setShowFrequencyWarning(null);
  }, []);

  const handlePtPatternChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuickPtPattern(e.target.value.toUpperCase());
    setQuickAssignError(null); // Clear error on input change
  }, []);

  const handleCtTokenChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuickCtToken(e.target.value);
    setQuickAssignError(null); // Clear error on input change
  }, []);

  type RowMeta = {
    isError: boolean;
    lockedTokens: string[];
    isLocked: boolean;
    lockedMismatch: boolean;
    isViolationSingle: boolean;
    hasEmptyCell: boolean;
    hasDuplicateChosenKey: boolean;
    hasInvalidLength: boolean;
  };

  // Compute per-row error details once — render loop reads from this map directly
  // to avoid recomputing lockedTokens, mismatch etc. a second time.
  const rowMetaByOT = useMemo(() => {
    // Step 1: find duplicate first-tokens across PT chars (single mode only)
    const tokenToOTs: Record<string, Set<string>> = {};
    for (const row of sortedAggregated) {
      const token = (row.ctList[0] ?? '').trim();
      if (!token) continue;
      (tokenToOTs[token] ||= new Set()).add(row.pt);
    }
    const dupPTs = new Set<string>();
    for (const ots of Object.values(tokenToOTs)) {
      if (ots.size > 1) for (const pt of ots) dupPTs.add(pt);
    }

    // Step 2: build per-row meta
    const out: Record<string, RowMeta> = {};
    const isFixedLengthError = ctParseMode === 'fixedLength' && groupSize > 1;
    for (const row of sortedAggregated) {
      const uniqueCount = (row as { uniqueCount?: number; ctList: string[] }).uniqueCount ?? row.ctList.length;
      const lockedTokens = normalizeToArray(lockedKeys?.[row.pt]);
      const isLocked = lockedTokens.length > 0;

      let lockedMismatch = false;
      if (isLocked && row.ctList.length > 0) {
        lockedMismatch = keysPerPTMode === 'multiple'
          ? !lockedTokens.every(lt => row.ctList.includes(lt))
          : lockedTokens[0] !== row.ctList[0];
      }

      const isViolationSingle = keysPerPTMode === 'single' && uniqueCount > 1;
      const hasEmptyCell = Boolean(hasEmptyCellByOT[row.pt]);
      const hasDuplicateChosenKey = keysPerPTMode === 'single' && dupPTs.has(row.pt);
      const hasInvalidLength = isFixedLengthError && row.ctList.some(t => t.length !== groupSize);
      const isError = Boolean(isViolationSingle || lockedMismatch || row.ctList.length === 0 || hasEmptyCell || hasDuplicateChosenKey || hasInvalidLength);

      out[row.pt] = { isError, lockedTokens, isLocked, lockedMismatch, isViolationSingle, hasEmptyCell, hasDuplicateChosenKey, hasInvalidLength };
    }
    return out;
  }, [hasEmptyCellByOT, keysPerPTMode, lockedKeys, sortedAggregated, ctParseMode, groupSize]);

  // If a previously-highlighted PT is no longer eligible for the highlight icon,
  // automatically turn off the highlight so cells don't stay highlighted.
  useEffect(() => {
    if (!highlightedPTChar) return;
    if (!onToggleHighlightOT) return;

    const meta = rowMetaByOT[highlightedPTChar];
    if (!meta) return;

    // Highlight is never allowed for locked rows.
    if (meta.isLocked) {
      onToggleHighlightOT(highlightedPTChar);
      return;
    }

    if (keysPerPTMode === 'multiple') {
      // In multi-key mode keep highlight sticky until user turns it off.
      return;
    }

    // In single-key mode, keep existing behavior: highlight only error rows.
    if (meta.isError) return;
    onToggleHighlightOT(highlightedPTChar);
  }, [rowMetaByOT, highlightedPTChar, onToggleHighlightOT, keysPerPTMode]);

  if (sortedAggregated.length === 0) return <div className="text-xs text-gray-500">(no pairs)</div>;

  // Bulk locks and error/allLocked flags derived from rowMetaByOT
  const bulkLocks: Record<string, string | string[]> = {};
  let hasError = false;
  let allLocked = sortedAggregated.length > 0;
  for (const row of sortedAggregated) {
    const meta = rowMetaByOT[row.pt];
    if (meta?.isError) hasError = true;
    if (row.ctList.length > 0) {
      bulkLocks[row.pt] = keysPerPTMode === 'multiple' ? row.ctList : row.ctList[0];
    }
    if (!(row.ctList.length > 0 && meta?.isLocked)) allLocked = false;
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-1 flex-col min-h-0">
      {/* Quick Assign Section */}
      {onQuickAssign && (
        <div className="px-3 py-3 bg-gray-50 border-b border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-2">Quick Assign</div>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                type="text"
                placeholder="PT pattern (e.g. DOG)"
                value={quickPtPattern}
                onChange={handlePtPatternChange}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="CT token (e.g. 111)"
                value={quickCtToken}
                onChange={handleCtTokenChange}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleQuickAssign}
              disabled={!quickPtPattern || !quickCtToken}
              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              title="Merge and assign PT pattern to CT token"
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
        <div className="flex items-center gap-2">
          {allLocked && (
            <button
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              onClick={() => downloadKeyAsJson(sortedAggregated, keysPerPTMode, deceptionList)}
              title="Export reconstructed key as JSON file"
            >
              Export JSON
            </button>
          )}
          {onLockAll && (
            <button
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={() => onLockAll && onLockAll(bulkLocks)}
              disabled={hasError}
              title={hasError ? 'Fix errors first (multiple keys / lock mismatch / empty CT)' : 'Lock all PT characters → CT according to table'}
            >
              Lock all
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1 w-12">PT</th>
              <th className="text-left px-2 py-1">CT</th>
              <th className="text-left px-2 py-1 w-20">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {sortedAggregated.map((row) => {
              const { isError: isRowError, lockedTokens, isLocked, lockedMismatch, isViolationSingle, hasEmptyCell, hasDuplicateChosenKey, hasInvalidLength } = rowMetaByOT[row.pt] ?? {
                isError: false, lockedTokens: [], isLocked: false, lockedMismatch: false,
                isViolationSingle: false, hasEmptyCell: false, hasDuplicateChosenKey: false, hasInvalidLength: false,
              };
              const trClass = isRowError ? 'bg-red-50' : '';
              return (
                <tr key={row.pt} className={`border-t border-gray-100 ${trClass}`}>
                  <td className="px-2 py-1 font-mono whitespace-nowrap text-xs">{row.pt}</td>
                  <td className="px-2 py-1 font-mono text-xs">
                    {keysPerPTMode === 'multiple' && row.ctList.length > 0 ? (
                      <div>
                        <div className="flex flex-wrap gap-1">
                          {row.ctList.map((ct, idx) => {
                            const isLockedToken = lockedTokens.includes(ct);
                            return (
                              <span
                                key={idx}
                                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs ${isLockedToken
                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                    : 'bg-gray-100 text-gray-800 border border-gray-300'
                                  }`}
                                title={isLockedToken ? 'Locked' : undefined}
                              >
                                {ct}
                                {isLockedToken && <img src={padlock} alt="Locked" className="w-2 h-2" />}
                              </span>
                            );
                          })}
                          {row.ctList.length > 1 && (
                            <span className="text-xs text-gray-500 self-center">
                              ({row.ctList.length} homophones)
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
                        <span className="whitespace-nowrap">{(row.ctList.length ? row.ctList.join(' ') : '—') || '—'}</span>
                        {isViolationSingle && <span className="ml-2 text-red-600">(multiple keys)</span>}
                        {lockedMismatch && <span className="ml-2 text-red-600">(lock mismatch)</span>}
                        {hasEmptyCell && <span className="ml-2 text-red-600">(missing)</span>}
                        {hasDuplicateChosenKey && <span className="ml-2 text-red-600">(duplicate)</span>}
                        {hasInvalidLength && <span className="ml-2 text-red-600">(invalid length)</span>}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1 text-xs">
                    {onLockOT || onUnlockOT ? (
                      <>
                          {isLocked ? (
                          <button
                            className={`text-xs px-1 py-0.5 rounded ${colors.lockedBtn}`}
                            onClick={() => onUnlockOT && onUnlockOT(row.pt)}
                            title={`Unlock ${row.pt}`}
                            aria-label={`Unlock ${row.pt}`}
                            aria-pressed={true}
                          >
                            <img src={padlock} alt="" aria-hidden="true" className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            className={`text-xs px-1 py-0.5 rounded ${colors.unlockedBtn}`}
                            onClick={() => {
                              if (!onLockOT || row.ctList.length === 0) return;
                              if (keysPerPTMode === 'multiple') {
                                // Lock all tokens for this character
                                row.ctList.forEach(ct => onLockOT(row.pt, ct));
                              } else {
                                // Lock first token only
                                onLockOT(row.pt, row.ctList[0]);
                              }
                            }}
                            disabled={isRowError || row.ctList.length === 0}
                            title={isRowError ? 'Fix the red error state first' : (row.ctList.length ? `Lock ${row.pt}` : 'Nothing to lock')}
                            aria-label={isRowError ? `Cannot lock ${row.pt} while errors exist` : (row.ctList.length ? `Lock ${row.pt}` : `Nothing to lock for ${row.pt}`)}
                            aria-pressed={false}
                          >
                            <img src={padlock} alt="" aria-hidden="true" className="w-3 h-3" />
                          </button>
                        )}
                        {/* Highlighter icon in single mode only for conflict rows; in multi mode for unlocked rows */}
                        {onToggleHighlightOT && !isLocked && (keysPerPTMode === 'multiple' || isRowError) ? (
                          <button
                            className={`ml-2 inline-flex items-center justify-center w-6 h-6 rounded ${highlightedPTChar === row.pt ? 'bg-purple-600 text-white' : 'text-purple-600 hover:bg-purple-50'}`}
                            onClick={() => onToggleHighlightOT(row.pt)}
                            title={`Highlight PT ${row.pt}`}
                            aria-label={`Highlight PT ${row.pt}`}
                            aria-pressed={highlightedPTChar === row.pt}
                          >
                            <img src={highlighter} alt="highlight" aria-hidden="true" className="w-3 h-3" />
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

        {/* Null / Deception tokens section */}
        {deceptionList.length > 0 && (
          <div className="px-3 py-3 bg-purple-50 border-t border-purple-100">
            <div className="text-sm font-medium text-purple-800 mb-2">Nulls (deception tokens)</div>
            <div className="flex flex-wrap gap-2">
              {deceptionList.map((t) => (
                <span key={t} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800 border border-purple-200 font-mono">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Frequency Warning Modal */}
      {showFrequencyWarning && (
        <Modal
          isOpen={true}
          onClose={handleCancelFrequencyWarning}
          title="Frequency Mismatch Warning"
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              The pattern <strong>{quickPtPattern}</strong> appears <strong>{showFrequencyWarning.ptCount}x</strong> in PT,
              but token <strong>{quickCtToken}</strong> appears <strong>{showFrequencyWarning.ctCount}x</strong> in CT.
            </p>
            <p className="text-gray-700">
              This frequency mismatch may indicate an incorrect assignment. Do you want to proceed anyway?
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleCancelFrequencyWarning}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFrequencyWarning}
                className="px-4 py-2 text-white bg-purple-600 rounded hover:bg-purple-700"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

KeyTable.displayName = 'KeyTable';

export default React.memo(KeyTable);

