import React from 'react';
import type { ZTToken } from '../../types/domain';

export interface UniqueZTTokenText {
  text: string;
  allBracketed: boolean;
}

interface BracketEditorProps {
  ztTokens: ZTToken[];
  analysisDone: boolean;
  bracketWarning: string | null;
  uniqueZTTokenTexts: UniqueZTTokenText[];
  onToggleText: (text: string) => void;
  onClear: () => void;
}

const BracketEditor: React.FC<BracketEditorProps> = ({
  ztTokens,
  analysisDone,
  bracketWarning,
  uniqueZTTokenTexts,
  onToggleText,
  onClear,
}) => {
  if (ztTokens.length === 0 || !analysisDone) return null;
  return (
    <div className="border rounded p-3 border-purple-200 bg-purple-50/40">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Deception token (move tokens into brackets)</div>
        <div className="flex gap-2">
          <button
            className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200"
            onClick={onClear}
            title="Clear all deception brackets"
          >Clear</button>
        </div>
      </div>
      {bracketWarning && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">{bracketWarning}</div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {uniqueZTTokenTexts.map(({ text, allBracketed }) => (
          <button
            key={text}
            className={`text-xs font-mono px-1.5 py-0.5 rounded border select-none ${
              allBracketed ? 'bg-purple-200 border-purple-300 text-purple-900' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
            }`}
            onClick={() => onToggleText(text)}
            title={allBracketed ? 'Return all identical tokens from brackets' : 'Move all identical tokens into brackets'}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BracketEditor;
