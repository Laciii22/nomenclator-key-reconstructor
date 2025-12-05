
export type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';
import type { OTChar as _OTChar, ZTToken as _ZTToken, KeysPerOTMode as _KeysPerOTMode } from '../types/domain';

export type KeyTableProps = {
  otRows: _OTChar[][];
  ztTokens: _ZTToken[];
  keysPerOTMode?: _KeysPerOTMode;
  lockedKeys?: Record<string, string>;
  onLockOT?: (ot: string, lockValue: string) => void;
  onUnlockOT?: (ot: string) => void;
  onLockAll?: (locks: Record<string, string>) => void;
  selections?: Record<string, string | null>;
  ztParseMode?: 'separator' | 'fixedLength';
  groupSize?: number; // only relevant for fixedLength mode
};

export type MappingTableProps = {
  otRows: _OTChar[][];
  ztTokens: _ZTToken[];
  onMoveZTToken?: (tokenIndex: number, toRow: number, toCol: number) => void;
  onLockOT?: (ot: string, lockValue: string) => void;
  onUnlockOT?: (ot: string) => void;
  lockedKeys?: Record<string, string>;
  hasDeceptionWarning?: boolean;
  onEditToken?: (tokenIndex: number, newText: string) => void;
  selections?: Record<string, string | null>;
};

export type OTCellProps = {
  ot: _OTChar | null;
  tokens: _ZTToken[];
  tokenIndices: number[];
  row: number;
  col: number;
  onLockOT?: (otChar: string, lockValue: string) => void;
  onUnlockOT?: (otChar: string) => void;
  lockedValue?: string;
  onEditToken?: (tokenIndex: number, newText: string) => void;
  deception?: boolean;
  isFixedLength?: boolean;
  flatIndex?: number; // positional index among OT cells (fixedLength mode)
  onInsertAfterGroup?: (flatIndex: number) => void; // trigger raw insertion prompt upstream
};

export type ZTTokenProps = {
  token: _ZTToken;
  tokenIndex: number;
  row: number;
  col: number;
  onEdit?: (tokenIndex: number, newText: string) => void;
  isLocked?: boolean;
};

export type Pair = { ot: string; zt: string };

export type Column = { ot: _OTChar | null; zt: number[]; deception?: boolean };