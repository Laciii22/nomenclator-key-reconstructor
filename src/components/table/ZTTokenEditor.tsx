import React, { useEffect, useRef, useState } from 'react';
import type { ZTTokenProps } from '../types';

type EditorProps = {
  tokenText: string;
  isLocked: boolean;
  onCommit: (next: string) => void;
  onCancel: () => void;
};

export const ZTTokenEditor: React.FC<EditorProps> = ({ tokenText, isLocked, onCommit, onCancel }) => {
  const [value, setValue] = useState(tokenText);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setValue(tokenText); }, [tokenText]);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  function commit() {
    const next = value.trim();
    if (next && next !== tokenText) onCommit(next);
  }

  function cancel() {
    setValue(tokenText);
    onCancel();
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => { commit(); }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      className="text-xs px-0.5 py-0 rounded border border-yellow-300 bg-white text-yellow-700 font-mono w-12"
      disabled={isLocked}
    />
  );
};

export default ZTTokenEditor;
