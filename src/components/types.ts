import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';

// Re-export core domain types for backwards compatibility with imports
export type { OTChar, ZTToken, KeysPerOTMode };

export type KeyTableProps = {
  otRows: OTChar[][];
  ztTokens: ZTToken[];
  keysPerOTMode?: KeysPerOTMode;
  lockedKeys?: Record<string, string>;
  onLockOT?: (ot: string, lockValue: string) => void;
  onUnlockOT?: (ot: string) => void;
  onLockAll?: (locks: Record<string, string>) => void;
  selections?: Record<string, string | null>;
  ztParseMode?: 'separator' | 'fixedLength';
  groupSize?: number; // only relevant for fixedLength mode
};

export type MappingTableProps = {
  otRows: OTChar[][];
  ztTokens: ZTToken[];
  onMoveZTToken?: (tokenIndex: number, toRow: number, toCol: number) => void;
  onLockOT?: (ot: string, lockValue: string) => void;
  onUnlockOT?: (ot: string) => void;
  lockedKeys?: Record<string, string>;
  hasDeceptionWarning?: boolean;
  onEditToken?: (tokenIndex: number, newText: string) => void;
  selections?: Record<string, string | null>;
};

export type OTCellProps = {
  ot: OTChar | null;
  tokens: ZTToken[];
  tokenIndices: number[];
  row: number;
  col: number;
  onLockOT?: (otChar: string, lockValue: string) => void;
  onUnlockOT?: (otChar: string) => void;
  lockedValue?: string;
  onEditToken?: (tokenIndex: number, newText: string) => void;
  deception?: boolean;
  isFixedLength?: boolean;
  groupSize?: number;
  flatIndex?: number; // positional index among OT cells (fixedLength mode)
  onInsertAfterGroup?: (flatIndex: number) => void; // trigger raw insertion prompt upstream
  onSplitGroup?: (flatIndex: number) => void; // split merged OT group back into singles
};

export type ZTTokenProps = {
  token: ZTToken;
  tokenIndex: number;
  row: number;
  col: number;
  onEdit?: (tokenIndex: number, newText: string) => void;
  isLocked?: boolean;
};

export type Pair = { ot: string; zt: string };

export type Column = { ot: OTChar | null; zt: number[]; deception?: boolean };