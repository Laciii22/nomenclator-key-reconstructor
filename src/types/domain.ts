/**
 * Domain types for nomenclator cipher reconstruction.
 * 
 * A nomenclator is a cipher that combines:
 * - Character substitution (letters → cipher tokens)
 * - Code words (whole words/phrases → cipher tokens)
 * - Nulls (meaningless tokens to confuse cryptanalysts)
 * 
 * This application helps reconstruct the key by aligning:
 * - PT (original/plain text)
 * - CT (cipher text)
 */

/**
 * A single cipher token from the encrypted text (CT).
 */
export type CTToken = {
  /** Unique identifier for React keys and drag-and-drop */
  id: string;
  /** The cipher token value (e.g., "123", "abc") */
  text: string;
};

/**
 * A single character from the plain text (Originaltext/PT).
 */
export type PTChar = {
  /** Unique identifier for React keys */
  id: string;
  /** The plain text character */
  ch: string;
};

/**
 * Mode for key reconstruction: whether each PT character can map to
 * a single cipher token or multiple (for homophonic substitution).
 */
export type KeysPerPTMode = 'single' | 'multiple';

/**
 * - In 'single' mode: string (one token per character)
 * - In 'multiple' mode: string[] (multiple homophones per character)
 */
export type LockedKeys = Record<string, string | string[]>;

/**
 * Maps each PT character to selected CT token(s) (or null if unselected).
 * - In 'single' mode: string | null (one token per character)
 * - In 'multiple' mode: string[] (multiple homophones per character)
 */
export type SelectionMap = Record<string, string | string[] | null>;

/**
 * Data attached to a drag-and-drop event via @dnd-kit's `data.current`.
 * Shared across all DnD sources (PT cells, CT tokens, drop targets).
 * All fields are optional — only the relevant subset is populated per source.
 */
export type DragData = {
  /** Drag origin: 'ct' for cipher token, 'pt' for plain-text cell, 'ct-edge' for left/right edge strips (fixed-length mode) 
   *  Because we wanted funcionality for splitting even tokens even in figed-length mode.
  */
  type?: 'ct' | 'pt' | 'ct-edge';
  /** Flat index of the CT token being dragged */
  tokenIndex?: number;
  /** Row of the source PT cell */
  sourceRow?: number;
  /** Column of the source PT cell */
  sourceCol?: number;
  /** Row of the drop target cell */
  row?: number;
  /** Column of the drop target cell */
  col?: number;
  /** True if the drop target is a deception (klamac) cell */
  isKlamac?: boolean;
  /** CT token object when dragging a cipher token */
  token?: { id: string; text: string };
  /** PT character string when dragging a plain-text cell */
  ptChar?: string;
  /** Flat all-cell index (used for shift/split actions) */
  flatIndex?: number;
  /** Which edge the strip is on ('left' | 'right') — used by ct-edge drop strips */
  direction?: 'left' | 'right';
  /** True when this drop target is the correct active target for the current drag */
  active?: boolean;
};
