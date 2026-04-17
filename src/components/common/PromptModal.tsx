import React, { useEffect, useRef, useState } from 'react';

interface PromptModalProps {
  isOpen: boolean;
  /** Dialog heading */
  title: string;
  /** Label shown above the text input */
  label: string;
  /** Optional second input label (for dual-field edits) */
  secondaryLabel?: string;
  /** Pre-filled text (re-applied every time the modal opens) */
  initialValue?: string;
  /** Pre-filled text for the optional secondary input */
  secondaryInitialValue?: string;
  /** Called with the current input when the user clicks OK or presses Enter */
  onConfirm: (value: string, secondaryValue?: string) => void;
  /** Called when the user clicks Cancel, the backdrop, or presses Escape */
  onCancel: () => void;
}

/**
 * Accessible, non-blocking replacement for `window.prompt()`.
 *
 * Renders a small modal with a text input.  Keyboard shortcuts:
 *   - Enter → confirm
 *   - Escape → cancel
 *
 * The modal does NOT block the main thread and integrates with React's
 * event system, making it straightforward to test without global mocks.
 */
const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title,
  label,
  secondaryLabel,
  initialValue = '',
  secondaryInitialValue = '',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [secondaryValue, setSecondaryValue] = useState(secondaryInitialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef<number>(0);

  // Reset input text whenever the modal is (re-)opened
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      setValue(initialValue);
      setSecondaryValue(secondaryInitialValue);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isOpen, initialValue, secondaryInitialValue]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore the synthetic/ghost click that can follow pointer-driven opening.
    if (Date.now() - openedAtRef.current < 180) return;
    if (e.target !== e.currentTarget) return;
    onCancel();
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(value, secondaryLabel ? secondaryValue : undefined);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, value, secondaryValue, secondaryLabel, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="prompt-modal-title" className="text-base font-semibold text-gray-800 mb-3">
          {title}
        </h2>
        <label
          className="block text-sm text-gray-600"
          htmlFor="prompt-modal-input"
        >
          {label}
        </label>
        <input
          id="prompt-modal-input"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2"
          autoFocus
        />
        {secondaryLabel ? (
          <>
            <label
              className="block text-sm text-gray-600"
              htmlFor="prompt-modal-secondary-input"
            >
              {secondaryLabel}
            </label>
            <input
              id="prompt-modal-secondary-input"
              type="text"
              value={secondaryValue}
              onChange={(e) => setSecondaryValue(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2"
            />
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value, secondaryLabel ? secondaryValue : undefined)}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptModal;
