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
 * - CT (cipher text tokens)
 */

/**
 * A single cipher token from the encrypted text (Ziffertext/CT).
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
 * User-confirmed mappings that shouldn't change during re-analysis.
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
