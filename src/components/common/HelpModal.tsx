/**
 * HelpModal: Comprehensive help documentation modal for the Nomenclator tool.
 * 
 * Provides detailed guidance on:
 * - Parse modes (separator vs fixed-length)
 * - Deception tokens
 * - Analysis workflow
 * - Key operations
 */

import React from 'react';
import Modal from './Modal';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Help modal with comprehensive usage documentation.
 */
const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How to Use Nomenclator Key Reconstructor">
      <div className="space-y-6 text-sm text-gray-700">
        
        {/* Quick Start */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Start</h3>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li><strong>Enter PT (plain text)</strong>: Type the deciphered text you have</li>
            <li><strong>Enter CT (cipher tokens)</strong>: Paste the cipher tokens</li>
            <li><strong>Choose parse mode</strong>: Select how to split CT tokens</li>
            <li><strong>Run analysis</strong>: Click the button to get frequency-based suggestions</li>
            <li><strong>Lock confident mappings</strong>: Click lock icons on verified pairs</li>
            <li><strong>Refine manually</strong>: Drag tokens or use candidate selectors</li>
          </ol>
        </section>

        {/* Parse Modes */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Parse Modes</h3>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Separator Mode</h4>
              <p className="mb-2">
                Use when cipher tokens are already separated by a delimiter (e.g., space, colon, comma).
              </p>
              <div className="bg-white rounded p-2 font-mono text-xs">
                Example: <span className="text-blue-600">12:34:56:78</span> with separator <span className="text-blue-600">:</span>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
              <h4 className="font-semibold text-purple-900 mb-2">Fixed-Length Mode</h4>
              <p className="mb-2">
                Use when cipher text is a continuous stream of characters that should be grouped by a fixed size.
              </p>
              <div className="bg-white rounded p-2 font-mono text-xs">
                Example: <span className="text-purple-600">12345678</span> with length <span className="text-purple-600">2</span> → 12, 34, 56, 78
              </div>
            </div>
          </div>
        </section>

        {/* Deception Tokens */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Deception Tokens</h3>
          <p className="mb-3">
            Historical ciphers often included "deception tokens" (nulls) that don't represent any plaintext character. 
            If your CT has more tokens than PT characters, some must be marked as deception.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="font-semibold text-yellow-900 mb-2">How to mark deception tokens:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Click the bracket icon next to a token's text</li>
              <li>All instances of that token will be excluded from analysis</li>
              <li>Click again to unmark</li>
            </ol>
          </div>
        </section>

        {/* Key Operations */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Operations</h3>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-green-100 rounded flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Lock/Unlock</h4>
                <p className="text-sm">Lock confirmed PT↔CT mappings to prevent analysis from overwriting them.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-blue-100 rounded flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Drag & Drop</h4>
                <p className="text-sm">Drag CT tokens between PT cells to manually assign mappings.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-purple-100 rounded flex items-center justify-center">
                <span className="text-purple-600 font-bold text-xs">±</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Split/Merge</h4>
                <p className="text-sm">Split grouped PT characters or merge them together to adjust alignment.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-orange-100 rounded flex items-center justify-center">
                <span className="text-orange-600 font-bold text-xs">↔</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Shift (Fixed-Length)</h4>
                <p className="text-sm">In fixed-length mode, shift token boundaries left or right to correct misalignments.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Tips */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Tips</h3>
          <ul className="space-y-2 ml-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Start by locking the most obvious mappings (high-frequency letters like E, T, A)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Re-run analysis after locking to get better suggestions for remaining characters</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Use "single key per PT" mode for simpler ciphers, "multiple keys" for more complex nomenclators with homophones — unambiguous homophones are auto-picked just like in single mode</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>The Key Table shows all PT→CT mappings at a glance</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Use <strong>Clear data</strong> (trash icon in the header) to wipe all saved inputs and start fresh — a confirmation dialog will appear first</span>
            </li>
          </ul>
        </section>

      </div>
    </Modal>
  );
};

export default HelpModal;
