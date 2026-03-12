/**
 * Separator mode candidate selector.
 * Thin wrapper around CandidateSelectorDropdown with groupSize=1.
 */

import React from 'react';
import CandidateSelectorDropdown from './CandidateSelectorDropdown';
import type { Candidate, SelectionMap } from '../../utils/analyzer';
import type { PTChar, CTToken } from '../../types/domain';
import type { Column } from '../types';

type Props = {
  candidatesByChar: Record<string, Candidate[]>;
  lockedKeys: Record<string, string>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  ptRows: PTChar[][];
  effectiveCtTokens: CTToken[];
  reservedTokens: Set<string>;
  sharedColumns: Column[][];
};

const CandidateSelectorSeparator: React.FC<Props> = (props) => (
  <CandidateSelectorDropdown
    candidatesByChar={props.candidatesByChar}
    lockedKeys={props.lockedKeys}
    selections={props.selections}
    setSelections={props.setSelections}
    ptRows={props.ptRows}
    effectiveCtTokens={props.effectiveCtTokens}
    reservedTokens={props.reservedTokens}
    sharedColumns={props.sharedColumns}
    groupSize={1}
    emptyOptionLabel="None (do not lock)"
  />
);

export default React.memo(CandidateSelectorSeparator);
