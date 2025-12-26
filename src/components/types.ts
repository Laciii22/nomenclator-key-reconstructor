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
  highlightedOTChar?: string | null;
  onToggleHighlightOT?: (ch: string) => void;
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
  highlightedOTChar?: string | null;
  // Optional precomputed columns (used when fixed-length shifting is enabled)
  columns?: Column[][];
  // Optional shift controls for fixed-length mode
  shiftMeta?: Array<{ canShiftLeft: boolean; canShiftRight: boolean }>;
  onShiftGroupLeft?: (flatIndex: number) => void;
  onShiftGroupRight?: (flatIndex: number) => void;
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
  // allowExpandFromStart: when true, OTCell may expand a single assigned
  // start index to a full fixed-length group by taking subsequent global
  // indices (only used in fixed-length mode).
  allowExpandFromStart?: boolean;
  highlightedOTChar?: string | null;
  // Optional shift controls (fixed-length mode) operating on flat OT index
  onShiftLeft?: (flatIndex: number) => void;
  onShiftRight?: (flatIndex: number) => void;
  canShiftLeft?: boolean;
  canShiftRight?: boolean;
};

export type ZTTokenProps = {
  token: ZTToken;
  tokenIndex: number;
  row: number;
  col: number;
  onEdit?: (tokenIndex: number, newText: string) => void;
  isLocked?: boolean;
};


export type Column = { ot: OTChar | null; zt: number[]; deception?: boolean };

// New prop used by OTCell to decide whether it's safe to expand a single
// assigned start index into a full fixed-length group by taking subsequent
// global token indices. MappingTable computes safety and passes this flag.
export type OTCellControlProps = {
  allowExpandFromStart?: boolean;
};