/**
 * Centralized Tailwind CSS class tokens for consistent UI styling.
 * 
 * Provides reusable color schemes for:
 * - Locked/unlocked states
 * - Error states
 * - Deception/null token indicators
 */

export const colors = {
  /** Styling for locked key indicators (chips) */
  lockedChip: 'bg-green-100 text-green-800 border-green-300',
  /** Text color for locked state */
  lockedText: 'text-green-700',
  /** Button styling for locked state */
  lockedBtn: 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300',
  /** Styling for unlocked key indicators */
  unlockedChip: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  /** Button styling for unlocked state */
  unlockedBtn: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300',
  /** Container styling for error states */
  errorContainer: 'text-red-700 bg-red-50 border-red-300',
  /** Text color for errors */
  errorText: 'text-red-600',
  /** Container styling for deception/null tokens */
  deceptionContainer: 'border border-red-300 rounded p-2 bg-red-50',
  /** Locked token styling */
  tokenLocked: 'bg-green-100 text-green-800 border-green-300',
  /** Unlocked token styling */
  tokenUnlocked: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};
