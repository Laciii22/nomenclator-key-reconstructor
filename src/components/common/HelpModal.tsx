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
import lockIcon from '../../assets/icons/padlock.png';
import moveIcon from '../../assets/icons/highlighter.png';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const userGuidePdfUrl = new URL('../../../docs/user_guide.pdf', import.meta.url).href;

/**
 * Help modal with comprehensive usage documentation.
 */
const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How to Use Nomenclator Key Reconstructor">
      <div className="space-y-6 text-sm text-gray-700">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Quick start</h3>
              <p className="mt-1 text-gray-600">
                Enter PT and CT, choose a parse mode, run analysis, then refine the mapping manually.
              </p>
            </div>
            <a
              href={userGuidePdfUrl}
              download="user_guide.pdf"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
            >
              Download user guide PDF
            </a>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Workflow</h3>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li><strong>Enter PT and CT</strong>: paste or type the plaintext and ciphertext.</li>
            <li><strong>Choose parse mode</strong>: use separator mode for delimited CT or fixed-length mode for continuous CT.</li>
            <li><strong>Select key mode</strong>: choose single-key for one CT token per PT character or multiple keys for homophones.</li>
            <li><strong>Run analysis</strong>: generate frequency-based candidates.</li>
            <li><strong>Lock confident mappings</strong>: confirm verified PT↔CT pairs so later analysis keeps them fixed.</li>
            <li><strong>Refine the grid</strong>: use drag-and-drop, split/merge, shift, and token editing to repair the mapping.</li>
          </ol>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Parsing modes</h3>
          <div className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Separator mode</h4>
              <p>
                Use this when CT tokens are already separated by a delimiter such as a space, colon, or comma.
              </p>
              <p className="mt-2 font-mono text-xs text-blue-700 bg-white rounded px-2 py-1 inline-block">
                Example: 12:34:56:78 with separator :
              </p>
            </div>

            <div className="rounded-md border border-purple-200 bg-purple-50 p-4">
              <h4 className="font-semibold text-purple-900 mb-2">Fixed-length mode</h4>
              <p>
                Use this when CT is a continuous stream that should be grouped into equal-sized tokens.
              </p>
              <p className="mt-2 font-mono text-xs text-purple-700 bg-white rounded px-2 py-1 inline-block">
                Example: 12345678 with length 2 → 12, 34, 56, 78
              </p>
              <p className="mt-2 text-gray-600">
                This mode also supports boundary shifting and edge token extraction/reattachment.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Analysis and suggestions</h3>
          <ul className="space-y-2 ml-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>Run analysis</strong> computes candidate PT→CT matches from frequency data.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>Frequency</strong> opens the PT/CT frequency view for quick inspection.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Soft suggestions appear after you lock stable mappings; they are hints, not final assignments.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>In homophone mode, one PT character may accept multiple CT tokens.</span>
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Mapping controls</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-green-100 rounded flex items-center justify-center">
                <img src={lockIcon} alt="" aria-hidden="true" className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Lock and unlock</h4>
                <p>Lock verified mappings so analysis does not overwrite them.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-blue-100 rounded flex items-center justify-center">
                <img src={moveIcon} alt="" aria-hidden="true" className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Drag and drop</h4>
                <p>Move CT tokens between PT cells or swap nearby tokens when the mapping needs correction.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-purple-100 rounded flex items-center justify-center">
                <span className="text-purple-600 font-bold text-xs">±</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Split and merge</h4>
                <p>Split grouped PT text into smaller units or merge them when the current segmentation is wrong.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 bg-orange-100 rounded flex items-center justify-center">
                <span className="text-orange-600 font-bold text-xs">↔</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Shift and extract</h4>
                <p>Fixed-length mode lets you shift token boundaries and extract or reattach edge tokens where needed.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Null tokens and cleanup</h3>
          <p className="mb-3">
            Historical nomenclators often include deception or null tokens. Mark them with the bracket control so they are excluded from analysis while still remaining in the data model.
          </p>
          <ul className="space-y-2 ml-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Null tokens are preserved, but they do not count as plaintext mappings.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Use <strong>Clear data</strong> to wipe saved inputs and start a fresh reconstruction session.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>Use the PDF guide if you want the longer explanation, examples, and troubleshooting notes.</span>
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Keyboard shortcuts</h3>
          <ul className="space-y-2 ml-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>H</strong>: open or close this help modal.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>F</strong>: open or close the frequency modal.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>Esc</strong>: close an open modal, or clear saved data when no modal is open.</span>
            </li>
          </ul>
        </section>
      </div>
    </Modal>
  );
};

export default HelpModal;
