import React, { useMemo } from 'react';
import type { KeyTableProps, Pair } from '../types';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';



// (Removed proportional distributeRow; KeyTable mirrors deterministic mapping)

/**
 * KeyTable displays the reconstructed nomenclator key pairs OT → ZT.
 *
 * - Computes pairs by walking the same allocation that MappingTable uses (rowGroups or proportional fallback).
 * - Aggregates by OT character; in 'single' mode it displays only the first key but still detects violations if multiple unique keys exist.
 * - Supports locking (ot -> zt) and highlights violations (multiple keys in 'single' mode, or mismatch with lock).
 */
const KeyTable: React.FC<KeyTableProps> = ({ otRows, ztTokens, keysPerOTMode = 'multiple', lockedKeys, onLockOT, onUnlockOT, onLockAll, selections }) => {
  // Unified mapping: reuse buildShiftOnlyColumns (same as MappingTable) and derive pairs ignoring deception cells.
  const pairs = useMemo(() => {
    const cols = buildShiftOnlyColumns(otRows, ztTokens, lockedKeys, selections);
    const out: Pair[] = [];
    for (const row of cols) {
      for (const col of row) {
        if (!col.ot) continue; // skip deception/null cells
        const ch = col.ot.ch;
        const idx = col.zt.length ? col.zt[0] : null;
        const zt = idx != null ? (ztTokens[idx]?.text || '') : '';
        out.push({ ot: ch, zt });
      }
    }
    return out;
  }, [otRows, ztTokens, lockedKeys, selections]);

  // Aggregate by OT character: collect ZT groups
  const aggregated = useMemo(() => {
    const map = new Map<string, { allSet: Set<string>; nonEmptySet: Set<string>; displayList: string[] }>();
    const order: string[] = [];
    for (const p of pairs) {
      if (!map.has(p.ot)) {
        map.set(p.ot, { allSet: new Set(), nonEmptySet: new Set(), displayList: [] });
        order.push(p.ot);
      }
      const entry = map.get(p.ot)!;
      const tokenText = p.zt; // may be '' for empty cell
      // Track all (including empty) and non-empty separately
      if (!entry.allSet.has(tokenText)) entry.allSet.add(tokenText);
      if (tokenText !== '' && !entry.nonEmptySet.has(tokenText)) entry.nonEmptySet.add(tokenText);
      // Display logic: skip additional empty duplicates; for single mode prefer first non-empty
      if (keysPerOTMode === 'single') {
        if (entry.displayList.length === 0) {
          // prefer non-empty; if empty and later non-empty arrives, replace
          entry.displayList.push(tokenText);
        } else if (entry.displayList[0] === '' && tokenText !== '') {
          entry.displayList[0] = tokenText;
        }
      } else {
        // multiple mode: include unique non-empty; include a single placeholder '—' if all empty
        if (tokenText === '') {
          // only add empty if we have none yet and no non-empty collected
          if (entry.displayList.length === 0) entry.displayList.push('');
        } else if (!entry.displayList.includes(tokenText)) {
          entry.displayList.push(tokenText);
        }
      }
    }
    return order.map(ot => {
      const entry = map.get(ot)!;
      const uniqueCountNonEmpty = entry.nonEmptySet.size; // count only real keys
      const dl = entry.displayList.filter(v => !(v === '' && uniqueCountNonEmpty > 0));
      return { ot, ztList: dl, uniqueCount: uniqueCountNonEmpty };
    });
  }, [pairs, keysPerOTMode]);

  // Abecedné zoradenie podľa OT znaku
  const sortedAggregated = useMemo(() => {
    return [...aggregated].sort((a, b) => a.ot.localeCompare(b.ot));
  }, [aggregated]);

  if (sortedAggregated.length === 0) return <div className="text-sm text-gray-500">(žiadne páry)</div>;

  // Determine if there are any violations (errors) and compute bulk locks
  let hasError = false;
  const bulkLocks: Record<string, string> = {};
  for (const row of sortedAggregated) {
    const uniqueCount = (row as { uniqueCount?: number; ztList: string[] }).uniqueCount ?? row.ztList.length;
    const isViolationSingle = keysPerOTMode === 'single' && uniqueCount > 1; // now based only on non-empty keys
    const isLocked = !!lockedKeys && typeof lockedKeys[row.ot] === 'string';
    const lockedMismatch = isLocked && row.ztList.length > 0 && lockedKeys![row.ot] !== row.ztList[0];
    if (isViolationSingle || lockedMismatch || row.ztList.length === 0) {
      hasError = true;
    }
    if (row.ztList.length > 0) {
      bulkLocks[row.ot] = row.ztList[0];
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
        <div className="text-sm font-medium text-gray-700">Kľúčové páry</div>
        {onLockAll && (
          <button
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => onLockAll && onLockAll(bulkLocks)}
            disabled={hasError}
            title={hasError ? 'Najprv oprav chyby (viac kľúčov / nesúlad / prázdny ZT)' : 'Zamknúť všetky OT → ZT podľa tabuľky'}
          >
            Zamknúť všetko
          </button>
        )}
      </div>
      <table className="w-full text-sm">
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
            const trClass = (isViolationSingle || lockedMismatch) ? 'bg-red-50' : '';
            return (
              <tr key={row.ot} className={`border-t border-gray-100 ${trClass}`}>
                <td className="px-3 py-2 font-mono">{row.ot}</td>
                <td className="px-3 py-2 font-mono">
                  <span>{(row.ztList.length ? row.ztList.join(' ') : '—') || '—'}</span>
                  {isViolationSingle && <span className="ml-2 text-red-600">(viac kľúčov)</span>}
                  {lockedMismatch && <span className="ml-2 text-red-600">(nesúlad so zámkom)</span>}
                </td>
                <td className="px-3 py-2">
                  {onLockOT || onUnlockOT ? (
                    isLocked ? (
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => onUnlockOT && onUnlockOT(row.ot)}
                        title={`Odomknúť ${row.ot}`}
                      >
                        Odomknúť
                      </button>
                    ) : (
                      <button
                        className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200"
                        onClick={() => onLockOT && row.ztList.length > 0 && onLockOT(row.ot, row.ztList[0])}
                        disabled={row.ztList.length === 0}
                        title={row.ztList.length ? `Zamknúť ${row.ot} = ${row.ztList[0]}` : 'Nie je čo zamknúť'}
                      >
                        Zamknúť
                      </button>
                    )
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
