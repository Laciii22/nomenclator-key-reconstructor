export type TokenCellProps = {
  token: string;
  locked?: boolean;
  onClick?: () => void;
};

export type OTChar = { id: string; ch: string };
export type ZTToken = { id: string; text: string; locked?: boolean };

export type KeyTableProps = {
  otRows: OTChar[][];
  ztTokens: ZTToken[];
  rowGroups?: number[][];
};

export type MappingTableProps = {
  otRows: OTChar[][];       
  ztTokens: ZTToken[];      
  rowGroups?: number[][];   
  onMoveZTToken?: (tokenIndex: number, toRow: number, toCol: number) => void;
};

export type OTCellProps = {
  ot: OTChar | null;
  tokens: ZTToken[];
  row: number;
  col: number;
  startIndex: number;
};

export type ZTTokenProps = {
  token: ZTToken;
  tokenIndex: number;
  row: number;
  col: number;
};

export type Pair = { ot: string; zt: string };

export type Column = { ot: OTChar | null; zt: ZTToken[] };