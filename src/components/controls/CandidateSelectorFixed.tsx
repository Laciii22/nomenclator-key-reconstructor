/**
 * Fixed-length mode candidate selector.
 * Thin wrapper around CandidateSelectorDropdown with groupSize derived from fixedLength.
 */

import React from 'react';
import CandidateSelectorDropdown from './CandidateSelectorDropdown';
import type { PTChar, CTToken } from '../../types/domain';
import type { Candidate, SelectionMap } from '../../utils/analyzer';
import type { Column } from '../types';

type Props = {
  candidatesByChar: Record<string, Candidate[]>;
  lockedKeys: Record<string, string>;
  selections: SelectionMap;
  setSelections: React.Dispatch<React.SetStateAction<SelectionMap>>;
  ptRows: PTChar[][];
  effectiveCtTokens: CTToken[];
  fixedLength: number;
  reservedTokens: Set<string>;
  sharedColumns: Column[][];
};

const CandidateSelectorFixed: React.FC<Props> = (props) => {
  const groupSize = Math.max(1, props.fixedLength || 1);
  return (
    <CandidateSelectorDropdown
      candidatesByChar={props.candidatesByChar}
      lockedKeys={props.lockedKeys}
      selections={props.selections}
      setSelections={props.setSelections}
      ptRows={props.ptRows}
      effectiveCtTokens={props.effectiveCtTokens}
      reservedTokens={props.reservedTokens}
      sharedColumns={props.sharedColumns}
      groupSize={groupSize}
      emptyOptionLabel="None"
    />
  );
};

export default React.memo(CandidateSelectorFixed);
