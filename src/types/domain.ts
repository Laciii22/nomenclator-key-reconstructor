/**
 * Domain types for nomenclator cipher reconstruction.
 * 
 * A nomenclator is a cipher that combines:
 * - Character substitution (letters → cipher tokens)
 * - Code words (whole words/phrases → cipher tokens)
 * - Nulls (meaningless tokens to confuse cryptanalysts)
 * 
 * This application helps reconstruct the key by aligning:
 * - OT (original/plain text)
 * - ZT (cipher text tokens)
 */

/**
 * A single cipher token from the encrypted text (Ziffertext/ZT).
 */
export type ZTToken = {
  /** Unique identifier for React keys and drag-and-drop */
  id: string;
  /** The cipher token value (e.g., "123", "abc") */
  text: string;
};

/**
 * A single character from the plain text (Originaltext/OT).
 */
export type OTChar = {
  /** Unique identifier for React keys */
  id: string;
  /** The plain text character */
  ch: string;
};

/**
 * Mode for key reconstruction: whether each OT character can map to
 * a single cipher token or multiple (for homophonic substitution).
 */
export type KeysPerOTMode = 'single' | 'multiple';

/**
 * User-confirmed mappings that shouldn't change during re-analysis.
 * Maps OT character → ZT token text.
 */
export type LockedKeys = Record<string, string>;

/**
 * Maps each OT character to a selected ZT token (or null if unselected).
 */
export type SelectionMap = Record<string, string | null>;
