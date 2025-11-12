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
        <label htmlFor="ztParseMode" className="whitespace-nowrap">Parsovanie ZT:</label>
        <select
          id="ztParseMode"
          className="border border-gray-300 rounded p-1 text-sm"
          value={ztParseMode}
          onChange={(e) => onChangeMode(e.target.value as 'separator' | 'fixedLength')}
        >
          <option value="separator">Oddelené znakom</option>
          <option value="fixedLength">Pevná dĺžka</option>
        </select>
        {ztParseMode === 'separator' && (
          <>
            <label htmlFor="separator" className="whitespace-nowrap">Znak:</label>
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
            <label htmlFor="fixedLength" className="whitespace-nowrap">Dĺžka:</label>
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
        <label htmlFor="keysPerOT" className="whitespace-nowrap">Počet kľúčov na OT znak:</label>
        <select
          id="keysPerOT"
          className="border border-gray-300 rounded p-1 text-sm"
          value={keysPerOTMode}
          onChange={(e) => onKeysPerOTModeChange(e.target.value as KeysPerOTMode)}
        >
          <option value="single">Jeden OT znak na jednu sadu znakov</option>
          <option value="multiple" disabled>Viac kľúčov na znak (pripravuje sa)</option>
        </select>
        <button
          className="ml-auto inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded"
          onClick={onRunAnalysis}
          disabled={!canRunAnalysis}
          title="Spustiť analýzu a návrhy zámkov"
        >
          Spustiť analýzu
        </button>
      </div>
    </>
  );
};

export default ParseControls;
