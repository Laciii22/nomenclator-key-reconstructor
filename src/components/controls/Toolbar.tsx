import React from 'react';

export type ToolbarProps = {
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
};

const Toolbar: React.FC<ToolbarProps> = ({ onUndo, onRedo, onExport }) => {
  return (
    <div className="flex gap-2 items-center">
      <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={onUndo}>Undo</button>
      <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={onRedo}>Redo</button>
      <button className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={onExport}>Export</button>
    </div>
  );
};

export default Toolbar;
