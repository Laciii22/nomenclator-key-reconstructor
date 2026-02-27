/**
 * Shared component prop types for the nomenclator reconstruction UI.
 */

import type { PTChar, CTToken, KeysPerPTMode } from '../types/domain';

// Re-export core domain types for backwards compatibility with imports
export type { PTChar, CTToken, KeysPerPTMode };

/**
 * Props for the KeyTable component, which displays the reconstructed
 * PT → CT key mappings.
 */
export type KeyTableProps = {
  /** Rows of plain text characters */
  ptRows: PTChar[][];
  /** All cipher tokens */
  ctTokens: CTToken[];
  /** Whether each PT char can map to one or multiple CT tokens */
  keysPerPTMode?: KeysPerPTMode;
  /** User-confirmed mappings that shouldn't change (single-key: string, multi-key: string[]) */
  lockedKeys?: Record<string, string | string[]>;
  /** Callback when user locks an PT→CT mapping */
  onLockOT?: (pt: string, lockValue: string) => void;
  /** Callback when user unlocks an PT character (specificToken for multi-key mode) */
  onUnlockOT?: (pt: string, specificToken?: string) => void;
  /** Callback to lock all valid pairs at once */
  onLockAll?: (locks: Record<string, string | string[]>) => void;
  /** Current manual selections for each PT character */
  selections?: Record<string, string | string[] | null>;
  /** Parsing mode for CT tokens */
  ctParseMode?: 'separator' | 'fixedLength';
  /** Size of token groups (relevant for fixedLength mode) */
  groupSize?: number;
  /** Currently highlighted PT character for error navigation */
  highlightedPTChar?: string | null;
  /** Callback to toggle highlighting on an PT character */
  onToggleHighlightOT?: (ch: string) => void;
};

/**
 * Props for the MappingTable component, which shows the PT/CT allocation grid.
 */
export type MappingTableProps = {
  /** Rows of plain text characters */
  ptRows: PTChar[][];
  /** All cipher tokens */
  ctTokens: CTToken[];
  /** Callback for drag-and-drop token movement */
  onMoveCTToken?: (tokenIndex: number, toRow: number, toCol: number) => void;
  /** Callback when user locks an PT→CT mapping */
  onLockOT?: (pt: string, lockValue: string) => void;
  /** Callback when user unlocks an PT character */
  onUnlockOT?: (pt: string, specificToken?: string) => void;
  /** User-confirmed mappings (single-key: string, multi-key: string[]) */
  lockedKeys?: Record<string, string | string[]>;
  /** Shows warning icon if deception/null tokens are detected */
  hasDeceptionWarning?: boolean;
  /** Callback when user edits a CT token inline */
  onEditToken?: (tokenIndex: number, newText: string) => void;
  /** Current manual selections */
  selections?: Record<string, string | string[] | null>;
  /** Currently highlighted PT character */
  highlightedPTChar?: string | null;
  /** Precomputed allocation columns (optional, for performance) */
  columns?: Column[][];
  /** Metadata for shift controls in fixed-length mode */
  shiftMeta?: Array<{ canShiftLeft: boolean; canShiftRight: boolean }>;
  /** Callback to shift a group left (fixed-length mode) */
  onShiftGroupLeft?: (flatIndex: number) => void;
  /** Callback to shift a group right (fixed-length mode) */
  onShiftGroupRight?: (flatIndex: number) => void;

  /** Active drag type from the page (used to avoid per-cell useDndContext re-renders) */
  activeDragType?: 'ct' | 'pt';
  /** Source row when dragging an PT cell */
  activePtSourceRow?: number;
  /** Source col when dragging an PT cell */
  activePtSourceCol?: number;
  /** Active token index when dragging a CT token */
  activeCtTokenIndex?: number | null;
  /** Keys per PT mode: 'single' or 'multiple' */
  keysPerPTMode?: 'single' | 'multiple';
};

/**
 * Props for a single PT grid cell.
 */
export type PTCellProps = {
  /** The PT character (null for deception/null cells) */
  pt: PTChar | null;
  /** All cipher tokens (for lookup) */
  tokens: CTToken[];
  /** Indices of CT tokens allocated to this cell */
  tokenIndices: number[];
  /** Grid row index */
  row: number;
  /** Grid column index */
  col: number;
  /** Callback to lock this PT character */
  onLockOT?: (ptChar: string, lockValue: string) => void;
  /** Callback to unlock this PT character */
  onUnlockOT?: (ptChar: string, specificToken?: string) => void;
  /** The locked CT value for this PT (if any), single-key: string, multi-key: string[] */
  lockedValue?: string | string[];
  /** Callback to edit a token inline */
  onEditToken?: (tokenIndex: number, newText: string) => void;
  /** True if this is a deception/null cell */
  deception?: boolean;
  /** True if using fixed-length parsing */
  isFixedLength?: boolean;
  /** Size of fixed-length groups */
  groupSize?: number;
  /** Flat index among all cells (including deception) for shift operations */
  flatIndex?: number;
  /** Flat index among PT cells only (excludes deception) for split operations */
  flatPtIndex?: number;
  /** Callback to insert raw characters after this group */
  onInsertAfterGroup?: (flatIndex: number) => void;
  /** Callback to split a merged PT group */
  onSplitGroup?: (flatPtIndex: number) => void;
  /** Whether to expand a single index to a full group */
  allowExpandFromStart?: boolean;
  /** Currently highlighted PT character */
  highlightedPTChar?: string | null;
  /** True if this PT's key conflicts with another PT's key */
  hasDuplicateKey?: boolean;
  /** Callback to shift this group left */
  onShiftLeft?: (flatIndex: number) => void;
  /** Callback to shift this group right */
  onShiftRight?: (flatIndex: number) => void;
  /** Whether shifting left is allowed */
  canShiftLeft?: boolean;
  /** Whether shifting right is allowed */
  canShiftRight?: boolean;

  /** Active drag type from the page (avoids per-cell useDndContext re-renders) */
  activeDragType?: 'ct' | 'pt';
  /** Source row when dragging an PT cell */
  activePtSourceRow?: number;
  /** Source col when dragging an PT cell */
  activePtSourceCol?: number;
  /** Active token index when dragging a CT token */
  activeCtTokenIndex?: number | null;
  /** Keys per PT mode: 'single' or 'multiple' */
  keysPerPTMode?: 'single' | 'multiple';
  /** Number of locked homophones for this PT character (multi-key mode badge) */
  lockedHomophonesCount?: number;
  /** True when token is sequentially consumed but not yet confirmed as a homophone */
  isTentative?: boolean;
};

/**
 * Props for a single CT token component.
 */
export type CTTokenProps = {
  /** The cipher token data */
  token: CTToken;
  /** Global index of this token in the CT array */
  tokenIndex: number;
  /** Grid row this token is displayed in */
  row: number;
  /** Grid column this token is displayed in */
  col: number;
  /** Callback when user edits this token */
  onEdit?: (tokenIndex: number, newText: string) => void;
  /** True if this token is locked to an PT character */
  isLocked?: boolean;

  /** Active drag type from the page (avoids per-token useDndContext re-renders) */
  activeDragType?: 'ct' | 'pt';
  /** Active token index when dragging a CT token */
  activeCtTokenIndex?: number | null;
};

/**
 * A column in the allocation grid, representing one PT position
 * and its allocated CT token indices.
 */
export type Column = {
  /** The PT character (null for deception) */
  pt: PTChar | null;
  /** Indices of CT tokens allocated here */
  ct: number[];
  /** True if this is a deception/null cell */
  deception?: boolean;
  /** True if the token is consumed sequentially (no confirmed homophone lock yet) */
  tentative?: boolean;
};