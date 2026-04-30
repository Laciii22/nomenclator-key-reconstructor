import type { SetStateAction } from 'react';
import type { SelectionMap, PTChar } from '../types/domain';

/**
 * Selection state reducer for managing locked keys, selections, and applied selections
 * for the mapping preview in the Nomenclator UI.
 */
export type NomenclatorSelectionState = {
  lockedKeys: Record<string, string | string[]>;
  selections: SelectionMap;
  appliedSelectionsForMapping: SelectionMap;
};

export type NomenclatorSelectionAction =
  | { type: 'setLockedKeys'; value: SetStateAction<Record<string, string | string[]>> }
  | { type: 'setSelections'; value: SetStateAction<SelectionMap> }
  | { type: 'setAppliedSelectionsForMapping'; value: SetStateAction<SelectionMap> }
  | { type: 'applySelectionLocks'; newLocks: Record<string, string | string[]> };

/**
 * Snapshot of state captured before Run Analysis is clicked.
 * Used for the resetToPreAnalysis action.
 */
export type PreAnalysisStateSnapshot = {
  ptRaw: string;
  ctRawSeparator: string;
  ctRawFixed: string;
  ctParseMode: 'separator' | 'fixedLength';
  separator: string;
  fixedLength: number;
  keysPerPTMode: 'single' | 'multiple';
  customPtGroups: PTChar[] | null;
  bracketedIndices: number[];
  fixedLengthTrackedBracketTexts: string[];
};
