/**
 * FrequencyModal: Shows absolute and relative frequency of PT and CT tokens.
 */

import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import type { PTChar, CTToken } from '../../types/domain';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface FrequencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  ptChars: PTChar[];
  ctTokens: CTToken[];
  /** For fixed-length mode: how many raw tokens form one logical token (default 1) */
  groupSize?: number;
}

type SortKey = 'token' | 'count';
type Tab = 'pt' | 'ct';

function computeFrequency(texts: string[]): { token: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([token, count]) => ({ token, count }));
}

const FrequencyModal: React.FC<FrequencyModalProps> = ({ isOpen, onClose, ptChars, ctTokens, groupSize = 1 }) => {
  const [tab, setTab] = useState<Tab>('pt');
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortAsc, setSortAsc] = useState(false);

  const ptRows = useMemo(() => computeFrequency(ptChars.map(c => c.ch)), [ptChars]);
  const ctRows = useMemo(() => {
    const g = Math.max(1, groupSize);  
    const texts: string[] = [];
    for (let i = 0; i < ctTokens.length; i += g) {
      texts.push(ctTokens.slice(i, i + g).map(t => t.text).join(''));
    }
    return computeFrequency(texts);
  }, [ctTokens, groupSize]);

  const rows = tab === 'pt' ? ptRows : ctRows;
  const total = rows.reduce((s, r) => s + r.count, 0);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = sortKey === 'count'
        ? a.count - b.count
        : a.token.localeCompare(b.token, undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  const chartData = useMemo(() => sorted.map(r => ({ name: r.token, value: r.count })), [sorted]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-blue-600 ml-0.5">{sortAsc ? '↑' : '↓'}</span>;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Frequency">
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['pt', 'ct'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'pt' ? 'Plain text (PT)' : 'Cipher text (CT)'}
          </button>
        ))}
      </div>

      {/* Summary */}
      <p className="text-xs text-gray-500 mb-3">
        Total tokens: <strong>{total}</strong> &nbsp;·&nbsp; Unique: <strong>{rows.length}</strong>
      </p>

      {/* Chart */}
      {rows.length > 0 && (
        <div className="mb-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#666" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} stroke="#666" />
              <Tooltip />
              <Bar dataKey="value" fill="#4b82ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No tokens yet.</p>
      ) : (
        <div className="overflow-auto max-h-[55vh]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th
                  className="text-left py-2 pr-4 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('token')}
                >
                  Token <SortIcon k="token" />
                </th>
                <th
                  className="text-right py-2 pr-4 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('count')}
                >
                  Count <SortIcon k="count" />
                </th>
                <th className="text-right py-2 pr-4 font-semibold text-gray-700 whitespace-nowrap">
                  Fraction
                </th>
                <th className="text-right py-2 font-semibold text-gray-700 whitespace-nowrap">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ token, count }) => {
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <tr key={token} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 pr-4">
                        <span className="inline-block max-w-[18rem] truncate font-mono font-semibold text-gray-900" title={token}>{token}</span>
                      </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">{count}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-gray-500 text-xs">
                      {count}/{total}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                      <span className="inline-block min-w-[4.5rem]">
                        {pct.toFixed(2)}%
                      </span>
                      {/* Mini bar */}
                      <span
                        className="inline-block ml-2 h-2 bg-blue-400 rounded-sm align-middle"
                        style={{ width: `${Math.max(pct, 0.5) * 1.2}px`, maxWidth: '80px' }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export default FrequencyModal;
