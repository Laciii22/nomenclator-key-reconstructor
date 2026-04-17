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
  /** Callback when user edits/removes a PT cell text by flat PT index */
  onEditPTAt?: (flatPtIndex: number, newText: string) => void;
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
  /** True when the active CT drag is from an injected null cell */
  activeCtIsFromNull?: boolean;
  /** Base flat index of the active null cell being dragged (null = none) */
  activeNullInsertedAfterBaseFlatIndex?: number | null;
  /** Number of tokens in the source cell of the active CT drag */
  activeCtSourceCellCount?: number;
};

/**
 * Props for a single PT grid cell.
 *
 * Grid-level values (tokens, lockedKeys, keysPerPTMode, onLockOT, onUnlockOT,
 * onEditToken, highlightedPTChar, groupSize, DnD active-drag state, shift
 * callbacks/metadata, and onSplitGroup) are provided via MappingCellContext
 * and no longer need to be threaded explicitly through the component tree.
 */
export type PTCellProps = {
  /** The PT character for this cell (null for deception / null cells) */
  pt: PTChar | null;
  /** Indices of CT tokens allocated to this cell */
  tokenIndices: number[];
  /** Grid row index */
  row: number;
  /** Grid column index */
  col: number;
  /** True if this is a deception / null cell */
  deception?: boolean;
  /** Flat index among all cells (including deception) — used by shift operations */
  flatIndex?: number;
  /** Flat index among PT-only cells (excludes deception) — used by split operations */
  flatPtIndex?: number;
  /**
   * Per-cell callback that fires when the user clicks the "+" button to
   * insert / edit raw CT characters for this group.
   *
   * Kept as an explicit prop (rather than in context) because it is a unique
   * closure per cell: MappingTable builds it with the cell's flat index and
   * the current row layout baked in.
   */
  onInsertAfterGroup?: (flatIndex: number) => void;
  /** Whether a short single-index group is allowed to expand to `groupSize` from its start */
  allowExpandFromStart?: boolean;
  /** True if this PT character's assigned CT token conflicts with another PT character */
  hasDuplicateKey?: boolean;
  /** True when the token is consumed sequentially but not yet confirmed as a homophone lock */
  isTentative?: boolean;
  /** Base flat index among base cells only (excludes injected null cells) — for retract logic */
  baseFlatIndex?: number;
  /** For injected deception cells: the base flat index after which this null was inserted */
  nullInsertedAfterBaseFlatIdx?: number;
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
  /** True when this token belongs to an injected null/deception cell */
  isFromNull?: boolean;
  /** When isFromNull: the base flat index after which the null cell was inserted */
  nullInsertedAfterBaseFlatIndex?: number;
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
  /** Base flat index (only base cells, not injected nulls) — used for shift/retract logic */
  baseFlatIdx?: number;
  /** Set only on injected null cells: the base flat index after which this null was inserted */
  insertedAfterBaseFlatIndex?: number;
};