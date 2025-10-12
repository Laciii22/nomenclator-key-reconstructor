import React from 'react';

export type SettingsPanelProps = {
  cols: number;
  minCols: number;
  maxCols: number;
  onChangeCols: (v: number) => void;
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ cols, minCols, maxCols, onChangeCols }) => {
  return (
    <div className="flex items-center gap-2">
      <span>Dĺžka riadku:</span>
      <input
        type="range"
        min={minCols}
        max={maxCols}
        value={cols}
        onChange={(e) => onChangeCols(Number(e.target.value))}
      />
      <span className="w-10 text-right">{cols}</span>
    </div>
  );
};

export default SettingsPanel;
