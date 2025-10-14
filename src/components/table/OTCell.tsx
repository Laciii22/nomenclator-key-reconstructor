import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { OTCellProps, OTChar, ZTToken } from '../types';
import ZTTokenComp from './ZTToken';


const OTCell: React.FC<OTCellProps> = ({ ot, tokens, row, col, startIndex }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${row}-${col}` });

  return (
    <div
      ref={setNodeRef}
      className={`border border-gray-200 rounded p-3 shadow-sm bg-white transition-colors ${isOver ? 'bg-blue-50 border-blue-300' : ''}`}
    >
      <div className="text-center font-mono text-base mb-2">
        {ot ? (
          <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-800 border border-green-300 font-mono text-lg font-bold">
            {ot.ch}
          </span>
        ) : (
          '·'
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {tokens.length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          tokens.map((t, i) => (
            <ZTTokenComp key={`${t.id}-${i}`} token={t} tokenIndex={startIndex + i} row={row} col={col} />
          ))
        )}
      </div>
    </div>
  );
};

export default OTCell;
