/**
 * Shared component prop types for the nomenclator reconstruction UI.
 */

import type { OTChar, ZTToken, KeysPerOTMode } from '../types/domain';

// Re-export core domain types for backwards compatibility with imports
export type { OTChar, ZTToken, KeysPerOTMode };

/**
 * Props for the KeyTable component, which displays the reconstructed
 * OT → ZT key mappings.
 */
export type KeyTableProps = {
  /** Rows of plain text characters */
  otRows: OTChar[][];
  /** All cipher tokens */
  ztTokens: ZTToken[];
  /** Whether each OT char can map to one or multiple ZT tokens */
  keysPerOTMode?: KeysPerOTMode;
  /** User-confirmed mappings that shouldn't change */
  lockedKeys?: Record<string, string>;
  /** Callback when user locks an OT→ZT mapping */
  onLockOT?: (ot: string, lockValue: string) => void;
  /** Callback when user unlocks an OT character */
  onUnlockOT?: (ot: string) => void;
  /** Callback to lock all valid pairs at once */
  onLockAll?: (locks: Record<string, string>) => void;
  /** Current manual selections for each OT character */
  selections?: Record<string, string | null>;
  /** Parsing mode for ZT tokens */
  ztParseMode?: 'separator' | 'fixedLength';
  /** Size of token groups (relevant for fixedLength mode) */
  groupSize?: number;
  /** Currently highlighted OT character for error navigation */
  highlightedOTChar?: string | null;
  /** Callback to toggle highlighting on an OT character */
  onToggleHighlightOT?: (ch: string) => void;
};

/**
 * Props for the MappingTable component, which shows the OT/ZT allocation grid.
 */
export type MappingTableProps = {
  /** Rows of plain text characters */
  otRows: OTChar[][];
  /** All cipher tokens */
  ztTokens: ZTToken[];
  /** Callback for drag-and-drop token movement */
  onMoveZTToken?: (tokenIndex: number, toRow: number, toCol: number) => void;
  /** Callback when user locks an OT→ZT mapping */
  onLockOT?: (ot: string, lockValue: string) => void;
  /** Callback when user unlocks an OT character */
  onUnlockOT?: (ot: string) => void;
  /** User-confirmed mappings */
  lockedKeys?: Record<string, string>;
  /** Shows warning icon if deception/null tokens are detected */
  hasDeceptionWarning?: boolean;
  /** Callback when user edits a ZT token inline */
  onEditToken?: (tokenIndex: number, newText: string) => void;
  /** Current manual selections */
  selections?: Record<string, string | null>;
  /** Currently highlighted OT character */
  highlightedOTChar?: string | null;
  /** Precomputed allocation columns (optional, for performance) */
  columns?: Column[][];
  /** Metadata for shift controls in fixed-length mode */
  shiftMeta?: Array<{ canShiftLeft: boolean; canShiftRight: boolean }>;
  /** Callback to shift a group left (fixed-length mode) */
  onShiftGroupLeft?: (flatIndex: number) => void;
  /** Callback to shift a group right (fixed-length mode) */
  onShiftGroupRight?: (flatIndex: number) => void;
};

/**
 * Props for a single OT grid cell.
 */
export type OTCellProps = {
  /** The OT character (null for deception/null cells) */
  ot: OTChar | null;
  /** All cipher tokens (for lookup) */
  tokens: ZTToken[];
  /** Indices of ZT tokens allocated to this cell */
  tokenIndices: number[];
  /** Grid row index */
  row: number;
  /** Grid column index */
  col: number;
  /** Callback to lock this OT character */
  onLockOT?: (otChar: string, lockValue: string) => void;
  /** Callback to unlock this OT character */
  onUnlockOT?: (otChar: string) => void;
  /** The locked ZT value for this OT (if any) */
  lockedValue?: string;
  /** Callback to edit a token inline */
  onEditToken?: (tokenIndex: number, newText: string) => void;
  /** True if this is a deception/null cell */
  deception?: boolean;
  /** True if using fixed-length parsing */
  isFixedLength?: boolean;
  /** Size of fixed-length groups */
  groupSize?: number;
  /** Flat index among non-deception OT cells (for insertion) */
  flatIndex?: number;
  /** Callback to insert raw characters after this group */
  onInsertAfterGroup?: (flatIndex: number) => void;
  /** Callback to split a merged OT group */
  onSplitGroup?: (flatIndex: number) => void;
  /** Whether to expand a single index to a full group */
  allowExpandFromStart?: boolean;
  /** Currently highlighted OT character */
  highlightedOTChar?: string | null;
  /** True if this OT's key conflicts with another OT's key */
  hasDuplicateKey?: boolean;
  /** Callback to shift this group left */
  onShiftLeft?: (flatIndex: number) => void;
  /** Callback to shift this group right */
  onShiftRight?: (flatIndex: number) => void;
  /** Whether shifting left is allowed */
  canShiftLeft?: boolean;
  /** Whether shifting right is allowed */
  canShiftRight?: boolean;
};

/**
 * Props for a single ZT token component.
 */
export type ZTTokenProps = {
  /** The cipher token data */
  token: ZTToken;
  /** Global index of this token in the ZT array */
  tokenIndex: number;
  /** Grid row this token is displayed in */
  row: number;
  /** Grid column this token is displayed in */
  col: number;
  /** Callback when user edits this token */
  onEdit?: (tokenIndex: number, newText: string) => void;
  /** True if this token is locked to an OT character */
  isLocked?: boolean;
};

/**
 * A column in the allocation grid, representing one OT position
 * and its allocated ZT token indices.
 */
export type Column = {
  /** The OT character (null for deception) */
  ot: OTChar | null;
  /** Indices of ZT tokens allocated here */
  zt: number[];
  /** True if this is a deception/null cell */
  deception?: boolean;
};