/**
 * ParseControls: Configuration panel for ZT parsing and analysis options.
 * 
 * Allows users to:
 * - Choose between separator and fixed-length parsing
 * - Configure separator character or fixed length
 * - Select single/multiple keys per OT mode
 * - Trigger frequency analysis
 */

import React from 'react';
import type { KeysPerOTMode } from '../types';
import HelpModal from '../common/HelpModal';

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
  onClear: () => void;
  isAnalyzing?: boolean;
}

/**
 * Control panel for parsing mode and analysis settings.
 */
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
  onClear,
  isAnalyzing = false,
}) => {
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);

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
          onChange={(e) => {
            console.log('Keys per OT mode changed to:', e.target.value);
            onKeysPerOTModeChange(e.target.value as KeysPerOTMode);
          }}
        >
          <option value="single">One key per OT character</option>
          <option value="multiple">Multiple keys per character (homophones)</option>
        </select>
        <button
          className="ml-auto inline-flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={onClear}
        >
          Clear
        </button>

        <button
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={onRunAnalysis}
          disabled={!canRunAnalysis || isAnalyzing}
          title={isAnalyzing ? "Analysis in progress..." : "Run analysis and lock suggestions"}
        >
          {isAnalyzing && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isAnalyzing ? 'Analyzing...' : 'Run analysis'}
        </button>


      </div>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
};

export default ParseControls;
