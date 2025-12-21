import React from 'react';
import type { KeysPerOTMode } from '../types';

interface ParseControlsProps {
  ztParseMode: 'separator' | 'fixedLength';
  onChangeMode: (mode: 'separator' | 'fixedLength') => void;
  separator: string;
  onSeparatorChange: (sep: string) => void;
  fixedLength: number;
  onFixedLengthChange: (len: number) => void;
  keysPerOTMode: KeysPerOTMode;
  onKeysPerOTModeChange: (mode: KeysPerOTMode) => void;
  canRunAnalysis: boolean;
  onRunAnalysis: () => void;
}

const ParseControls: React.FC<ParseControlsProps> = ({
  ztParseMode,
  onChangeMode,
  separator,
  onSeparatorChange,
  fixedLength,
  onFixedLengthChange,
  keysPerOTMode,
  onKeysPerOTModeChange,
  canRunAnalysis,
  onRunAnalysis,
}) => {
  return (
    <>
      <div className="flex items-center gap-3 text-sm mt-2">
        <label htmlFor="ztParseMode" className="whitespace-nowrap">Parsing ZT:</label>
        <select
          id="ztParseMode"
          className="border border-gray-300 rounded p-1 text-sm"
          value={ztParseMode}
          onChange={(e) => onChangeMode(e.target.value as 'separator' | 'fixedLength')}
        >
          <option value="separator">Separated by character</option>
          <option value="fixedLength">Fixed length</option>
        </select>
        {/* inline help */}
        <div className="ml-2">
          <details className="text-xs">
            <summary className="cursor-pointer underline">Help</summary>
            <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-xs max-w-sm">
              <strong>Separator mode</strong>: split ZT using the chosen separator character.
              <br />
              <strong>Fixed-length mode</strong>: ZT treated as raw characters grouped into fixed-size tokens.
              <br />
              <br />
              <strong>Deception</strong>: when ZT has extra tokens, mark them as deception to exclude from analysis.
            </div>
          </details>
        </div>
        {ztParseMode === 'separator' && (
          <>
            <label htmlFor="separator" className="whitespace-nowrap">Character:</label>
            <input
              id="separator"
              type="text"
              maxLength={1}
              className="border border-gray-300 rounded p-1 text-sm w-12 text-center"
              value={separator}
              onChange={(e) => onSeparatorChange(e.target.value)}
            />
          </>
        )}
        {ztParseMode === 'fixedLength' && (
          <>
            <label htmlFor="fixedLength" className="whitespace-nowrap">Length:</label>
            <input
              id="fixedLength"
              type="number"
              min="1"
              className="border border-gray-300 rounded p-1 text-sm w-16"
              value={fixedLength}
              onChange={(e) => onFixedLengthChange(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm mt-2">
        <label htmlFor="keysPerOT" className="whitespace-nowrap">Number of keys per OT character:</label>
        <select
          id="keysPerOT"
          className="border border-gray-300 rounded p-1 text-sm"
          value={keysPerOTMode}
          onChange={(e) => onKeysPerOTModeChange(e.target.value as KeysPerOTMode)}
        >
          <option value="single">One OT character per key set</option>
          <option value="multiple" disabled>Multiple keys per character (coming soon)</option>
        </select>
        <button
          className="ml-auto inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded"
          onClick={onRunAnalysis}
          disabled={!canRunAnalysis}
          title="Run analysis and lock suggestions"
        >
          Run analysis
        </button>
      </div>
    </>
  );
};

export default ParseControls;
