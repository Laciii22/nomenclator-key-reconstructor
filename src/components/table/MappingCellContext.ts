import { createContext, useContext } from 'react';
import type { CTToken, KeysPerPTMode } from '../../types/domain';

/**
 * Grid-level values shared across every cell rendered by MappingTable.
 *
 * Placing these in context instead of threading them as props eliminates
 * the 15-prop passthrough chain from NomenklatorPage → MappingTable → PTCell,
 * and allows PTCell to be self-contained for testing purposes.
 */
export interface MappingCellContextValue {
  // ── Data ─────────────────────────────────────────────────────────────────
  /** All cipher tokens (used for index-based lookup and rendering) */
  ctTokens: CTToken[];
  /** User-confirmed lock mappings, keyed by PT char */
  lockedKeys: Record<string, string | string[]>;
  /** Size of fixed-length groups (1 in separator mode) */
  groupSize: number;

  // ── Mode flags ────────────────────────────────────────────────────────────
  /** Whether each PT char maps to one or multiple CT tokens */
  keysPerPTMode: KeysPerPTMode;
  /** PT character to visually emphasize across the grid (null = none) */
  highlightedPTChar: string | null | undefined;

  // ── Callbacks ─────────────────────────────────────────────────────────────
  /** Lock a PT→CT token mapping */
  onLockOT?: (pt: string, lockValue: string) => void;
  /** Unlock a PT character (or remove one homophone in multi-key mode) */
  onUnlockOT?: (pt: string, specificToken?: string) => void;
  /** Edit a CT token's text inline */
  onEditToken?: (tokenIndex: number, newText: string) => void;
  /**
   * Split a merged PT group (callback is already gated by `canSplitGroup`
   * inside MappingTable before being placed here, so PTCell does not need
   * to know about that flag).
   */
  onSplitGroup?: (flatPtIndex: number) => void;
  /** Shift a fixed-length group one position to the left */
  onShiftGroupLeft?: (flatIndex: number) => void;
  /** Shift a fixed-length group one position to the right */
  onShiftGroupRight?: (flatIndex: number) => void;

  // ── DnD active drag state ─────────────────────────────────────────────────
  // Provided at the grid level to avoid per-cell `useDndContext` subscriptions,
  // which cause every cell to re-render on every drag move.
  /** Active drag type: 'ct' when dragging a CT token, 'pt' when dragging a PT cell */
  activeDragType?: 'ct' | 'pt';
  /** Row of the PT cell currently being dragged (undefined when not dragging PT) */
  activePtSourceRow?: number;
  /** Column of the PT cell currently being dragged */
  activePtSourceCol?: number;
  /** Index of the CT token currently being dragged (null = none) */
  activeCtTokenIndex?: number | null;

  // ── Shift metadata ────────────────────────────────────────────────────────
  /**
   * Per–flat-index shift permission flags, indexed by the cell's flat index.
   * PTCell derives `canShiftLeft`/`canShiftRight` from this directly.
   */
  shiftMeta?: Array<{ canShiftLeft: boolean; canShiftRight: boolean }>;
}

const MappingCellContext = createContext<MappingCellContextValue | null>(null);

/**
 * Consume grid-level cell context within PTCell.
 *
 * @throws if called outside a `<MappingCellContext.Provider>` (i.e. outside MappingTable).
 */
export function useMappingCellContext(): MappingCellContextValue {
  const ctx = useContext(MappingCellContext);
  if (!ctx) {
    throw new Error(
      '[useMappingCellContext] Must be used inside a MappingTable ' +
      '(or a <MappingCellContext.Provider> in tests).'
    );
  }
  return ctx;
}

export { MappingCellContext };
