import React from 'react';

export type TokenCellProps = {
  token: string;
  locked?: boolean;
  onClick?: () => void;
};

const TokenCell: React.FC<TokenCellProps> = ({ token, locked, onClick }) => {
  return (
    <span
      onClick={onClick}
      title={locked ? 'Locked' : undefined}
      className={
        'inline-block min-w-[14px] px-1 rounded ' +
        (locked ? 'bg-gray-200 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer')
      }
    >
      {token || '·'}
    </span>
  );
};

export default TokenCell;
