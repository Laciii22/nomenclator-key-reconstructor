import React from 'react';
import type { PTChar } from '../types/domain';
import type { NomenclatorSelectionState, NomenclatorSelectionAction } from './useNomenclator.types';

/**
 * Resolve a React setState action to its final value.
 * Handles both direct values and updater functions.
 */
export function resolveSetStateAction<T>(value: React.SetStateAction<T>, prev: T): T {
  return typeof value === 'function'
    ? (value as (prev: T) => T)(prev)
    : value;
}

/**
 * Reducer for managing selection state (locked keys, selections, applied selections).
 * Dispatches changes via type-safe action union.
 */
export function selectionStateReducer(
  state: NomenclatorSelectionState,
  action: NomenclatorSelectionAction,
): NomenclatorSelectionState {
  if (action.type === 'setLockedKeys') {
    return { ...state, lockedKeys: resolveSetStateAction(action.value, state.lockedKeys) };
  }
  if (action.type === 'setSelections') {
    return { ...state, selections: resolveSetStateAction(action.value, state.selections) };
  }
  if (action.type === 'setAppliedSelectionsForMapping') {
    return { ...state, appliedSelectionsForMapping: resolveSetStateAction(action.value, state.appliedSelectionsForMapping) };
  }

  if (Object.keys(action.newLocks).length === 0) return state;
  return {
    lockedKeys: { ...state.lockedKeys, ...action.newLocks },
    selections: {},
    appliedSelectionsForMapping: {},
  };
}

/**
 * Serialize PT groups (array of PTChar) back into raw PT string format.
 * Multi-char groups are wrapped in brackets [WORD], single chars are bare.
 */
export function serializePtGroupsToRaw(groups: PTChar[]): string {
  return groups
    .map(({ ch }) => {
      const normalized = ch.replace(/\s/g, '').toUpperCase();
      if (!normalized) return '';
      return normalized.length > 1 ? `[${normalized}]` : normalized;
    })
    .join('');
}

/**
 * Equality check for UniqueTokenTextMeta arrays.
 * Used to avoid unnecessary re-renders in memoized contexts.
 */
export type UniqueTokenTextMeta = { text: string; allBracketed: boolean };

export function uniqueTokenTextMetaEqual(a: UniqueTokenTextMeta[], b: UniqueTokenTextMeta[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].text !== b[i].text || a[i].allBracketed !== b[i].allBracketed) return false;
  }
  return true;
}
