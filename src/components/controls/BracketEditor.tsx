/**
 * BracketEditor: Interface for marking deception/null tokens.
 * 
 * Allows users to exclude tokens from analysis by "bracketing" them.
 * Useful when CT has extra tokens that don't correspond to PT characters.
 */

import React from 'react';
import type { CTToken } from '../../types/domain';

export interface UniqueCTTokenText {
  /** The token text value */
  text: string;
  /** True if all occurrences of this token are currently bracketed */
  allBracketed: boolean;
}

interface BracketEditorProps {
  /** All CT tokens */
  ctTokens: CTToken[];
  /** Whether analysis has been run (editor only shows after analysis) */
  analysisDone: boolean;
  /** Warning message about bracket validity */
  bracketWarning: string | null;
  /** Unique token texts with bracket status */
  uniqueCTTokenTexts: UniqueCTTokenText[];
  /** Callback to toggle bracket status for a token text */
  onToggleText: (text: string) => void;
  /** Callback to clear all brackets */
  onClear: () => void;
  /** Locked keys — locked CT token texts cannot be marked as deception */
  lockedKeys?: Record<string, string | string[]>;
}

/**
 * Control panel for marking tokens as deception/null.
 */
const BracketEditor: React.FC<BracketEditorProps> = ({
  ctTokens,
  analysisDone,
  bracketWarning,
  uniqueCTTokenTexts,
  onToggleText,
  onClear,
  lockedKeys,
}) => {
  const lockedTexts = React.useMemo(() => {
    const set = new Set<string>();
    if (!lockedKeys) return set;
    for (const val of Object.values(lockedKeys)) {
      if (Array.isArray(val)) val.forEach(v => set.add(v));
      else set.add(val);
    }
    return set;
  }, [lockedKeys]);

  if (ctTokens.length === 0 || !analysisDone) return null;
  const bracketedCount = uniqueCTTokenTexts.filter(t => t.allBracketed).length;

  return (
    <div className="border rounded-lg p-3 border-purple-200 bg-purple-50/50">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm font-semibold text-purple-900">Null / Deception Tokens</span>
          {bracketedCount > 0 && (
            <span className="ml-2 text-xs font-medium bg-purple-200 text-purple-800 rounded-full px-2 py-0.5">{bracketedCount} excluded</span>
          )}
        </div>
        <button
          className="text-xs px-2 py-0.5 rounded-md border border-purple-200 bg-white hover:bg-purple-50 text-purple-700"
          onClick={onClear}
          title="Clear all deception brackets"
        >Clear all</button>
      </div>
      <p className="text-xs text-purple-600 mb-2">Click a token to mark it as a null/deception entry — it will be excluded from analysis. Click again to restore it.</p>
      {bracketWarning && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">{bracketWarning}</div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {uniqueCTTokenTexts.map(({ text, allBracketed }) => {
          const isLocked = lockedTexts.has(text);
          return (
            <button
              key={text}
              className={`text-xs font-mono px-2 py-1 rounded-md border select-none transition-colors min-w-0 ${
                isLocked
                  ? 'bg-green-100 border-green-300 text-green-700 cursor-not-allowed opacity-60'
                  : allBracketed
                    ? 'bg-purple-200 border-purple-400 text-purple-900 font-semibold'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-purple-50 hover:border-purple-300'
              }`}
              onClick={() => { if (!isLocked) onToggleText(text); }}
              disabled={isLocked}
              title={text}
            >
              <span className="inline-block max-w-[18rem] truncate">{allBracketed ? `[${text}]` : text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BracketEditor;
