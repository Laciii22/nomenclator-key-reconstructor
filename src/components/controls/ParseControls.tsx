/**
 * ParseControls: Configuration panel for CT parsing and analysis options.
 * 
 * Allows users to:
 * - Choose between separator and fixed-length parsing
 * - Configure separator character or fixed length
 * - Select single/multiple keys per PT mode
 * - Trigger frequency analysis
 */

import React from 'react';
import type { KeysPerPTMode } from '../types';
import loadingIcon from '../../assets/icons/loading.png';

const HelpModal = React.lazy(() => import('../common/HelpModal'));

interface ParseControlsProps {
  ctParseMode: 'separator' | 'fixedLength';
  onChangeMode: (mode: 'separator' | 'fixedLength') => void;
  separator: string;
  onSeparatorChange: (sep: string) => void;
  fixedLength: number;
  onFixedLengthChange: (len: number) => void;
  keysPerPTMode: KeysPerPTMode;
  onKeysPerPTModeChange: (mode: KeysPerPTMode) => void;
  canRunAnalysis: boolean;
  onRunAnalysis: () => void;
  onClear: () => void;
  isAnalyzing?: boolean;
  isBusy?: boolean;
}

/**
 * Control panel for parsing mode and analysis settings.
 */
const ParseControls: React.FC<ParseControlsProps> = ({
  ctParseMode,
  onChangeMode,
  separator,
  onSeparatorChange,
  fixedLength,
  onFixedLengthChange,
  keysPerPTMode,
  onKeysPerPTModeChange,
  canRunAnalysis,
  onRunAnalysis,
  onClear,
  isAnalyzing = false,
  isBusy = false,
}) => {
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [fixedLengthInput, setFixedLengthInput] = React.useState(String(fixedLength));
  const [isFixedLengthFocused, setIsFixedLengthFocused] = React.useState(false);

  React.useEffect(() => {
    if (isFixedLengthFocused) return;
    setFixedLengthInput(String(fixedLength));
  }, [fixedLength, isFixedLengthFocused]);

  const handleFixedLengthChange = React.useCallback((raw: string) => {
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    setFixedLengthInput(digitsOnly);
  }, []);

  const commitFixedLengthInput = React.useCallback(() => {
    const parsed = parseInt(fixedLengthInput, 10);
    const next = Number.isFinite(parsed) ? Math.max(1, parsed) : Math.max(1, fixedLength);
    setFixedLengthInput(String(next));
    if (next !== fixedLength) onFixedLengthChange(next);
  }, [fixedLength, fixedLengthInput, onFixedLengthChange]);

  return (
    <>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parsing configuration</h3>
          <button
            className="text-xs text-blue-600 hover:text-blue-800 underline"
            onClick={() => setIsHelpOpen(true)}
          >
            What is this for??
          </button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start gap-3 text-sm">
          <div className="flex-1 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="ctParseMode" className="whitespace-nowrap text-gray-600 font-medium">CT format:</label>
              <select
                id="ctParseMode"
                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 truncate max-w-[14rem]"
                value={ctParseMode}
                onChange={(e) => onChangeMode(e.target.value as 'separator' | 'fixedLength')}
                disabled={isBusy || isAnalyzing}
              >
                <option value="separator">Separated by character</option>
                <option value="fixedLength">Fixed length</option>
              </select>
            </div>

            {ctParseMode === 'separator' && (
              <div className="flex items-center gap-2">
                <label htmlFor="separator" className="whitespace-nowrap text-gray-600">Separator:</label>
                <input
                  id="separator"
                  type="text"
                  maxLength={1}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-12 text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={separator}
                  onChange={(e) => onSeparatorChange(e.target.value)}
                  disabled={isBusy || isAnalyzing}
                />
              </div>
            )}
            {ctParseMode === 'fixedLength' && (
              <div className="flex items-center gap-2">
                <label htmlFor="fixedLength" className="whitespace-nowrap text-gray-600">Token length:</label>
                <input
                  id="fixedLength"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={fixedLengthInput}
                  onFocus={() => setIsFixedLengthFocused(true)}
                  onBlur={() => {
                    setIsFixedLengthFocused(false);
                    commitFixedLengthInput();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitFixedLengthInput();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                    if (e.key === 'Escape') {
                      setFixedLengthInput(String(fixedLength));
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  onWheel={(e) => {
                    (e.currentTarget as HTMLInputElement).blur();
                  }}
                  onChange={(e) => handleFixedLengthChange(e.target.value)}
                  disabled={isBusy || isAnalyzing}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <label htmlFor="keysPerOT" className="whitespace-nowrap text-gray-600 font-medium">Keys per PT char:</label>
              <select
                id="keysPerOT"
                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 truncate max-w-[12rem]"
                value={keysPerPTMode}
                onChange={(e) => {
                  onKeysPerPTModeChange(e.target.value as KeysPerPTMode);
                }}
                disabled={isBusy || isAnalyzing}
              >
                <option value="single">Single (1:1)</option>
                <option value="multiple">Multiple (homophones)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-0 lg:pt-0 lg:pl-4 lg:border-l lg:border-gray-200">
            <button
              className="inline-flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-md transition-colors"
              onClick={onClear}
              disabled={isBusy || isAnalyzing}
            >
              Reset
            </button>
            <button
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
              onClick={onRunAnalysis}
              disabled={!canRunAnalysis || isAnalyzing || isBusy}
              title={isAnalyzing ? "Analysis in progress..." : isBusy ? "Applying configuration..." : !canRunAnalysis ? "Enter PT and CT text first" : "Run frequency analysis"}
            >
              {(isAnalyzing || isBusy) && (
                <img src={loadingIcon} alt="" aria-hidden="true" className="animate-spin h-4 w-4" />
              )}
              {isAnalyzing ? 'Analyzing...' : isBusy ? 'Applying...' : 'Run analysis'}
            </button>
            {!canRunAnalysis && (
              <span className="text-xs text-gray-400 italic">Enter PT and CT text above first</span>
            )}
          </div>
        </div>
      </div>

      <React.Suspense fallback={null}>
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </React.Suspense>
    </>
  );
};

export default ParseControls;
