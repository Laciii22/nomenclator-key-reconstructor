import { useMemo } from 'react';
import type { MappingTableProps } from '../types';
import OTCell from './OTCell';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';

function MappingTable(props: MappingTableProps & { groupSize?: number; onInsertRawCharsAfterPosition?: (positionIndex:number, text:string)=>void; onSplitGroup?: (flatIndex:number)=>void; canInsertRaw?: boolean; canSplitGroup?: boolean }) {
	const { otRows, ztTokens, lockedKeys, selections, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken, groupSize = 1, onInsertRawCharsAfterPosition, onSplitGroup, canInsertRaw = false, canSplitGroup = true } = props;

	const rows = useMemo(() => buildShiftOnlyColumns(otRows, ztTokens, lockedKeys, selections, groupSize), [otRows, ztTokens, lockedKeys, selections, groupSize]);

	// Flat index of OT cells (skip deception) for insertion prompt in fixedLength mode
	const flatIndices = useMemo(() => {
		let counter = 0;
		return rows.map(row => row.map(col => {
			if (col.ot) { const idx = counter; counter++; return idx; }
			return -1;
		}));
	}, [rows]);

	return (
		<div className={`space-y-4 ${hasDeceptionWarning ? 'border border-orange-300 rounded p-2 bg-orange-50' : ''}`}>
			{rows.map((cols, rIdx) => (
				<div key={rIdx} className="mb-4">
					<div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` }}>
						{cols.length === 0 ? (
							<div className="text-gray-400 text-sm">(empty row)</div>
						) : (
							cols.map((col, cIdx) => (
									// Determine whether it's safe to expand a single assigned index
									// into a full fixed-length group. We disallow expansion when any of
									// the would-be indices are already assigned to other cells.
									<OTCell
										key={cIdx}
										ot={col.ot ?? null}
										tokens={ztTokens}
										tokenIndices={col.zt}
										row={rIdx}
										col={cIdx}
										onLockOT={onLockOT}
										onUnlockOT={onUnlockOT}
										lockedValue={col.ot ? lockedKeys?.[col.ot.ch] : undefined}
										deception={Boolean(col.deception || col.ot == null)}
										onEditToken={onEditToken}
										isFixedLength={groupSize > 1}
										groupSize={groupSize}
										flatIndex={flatIndices[rIdx][cIdx]}
										// compute allowExpandFromStart for this cell
										allowExpandFromStart={(() => {
											if (!col.zt || col.zt.length === 0) return false;
											if (col.zt.length >= groupSize) return false; // already full
											if (groupSize <= 1) return false;
											const start = col.zt[0];
											// build a set of indices owned by other cells
											const otherOwned = new Set<number>();
											for (let rr = 0; rr < rows.length; rr++) {
												for (let cc = 0; cc < rows[rr].length; cc++) {
													if (rr === rIdx && cc === cIdx) continue;
													for (const idx of rows[rr][cc].zt) otherOwned.add(idx);
												}
											}
											for (let k = 1; k < groupSize; k++) {
												const idx = start + k;
												if (otherOwned.has(idx)) return false;
												// also ensure index exists in ztTokens
												if (idx >= ztTokens.length) return false;
											}
											return true;
										})()}
										onInsertAfterGroup={(fi) => {
											if (!canInsertRaw || fi < 0) return;
											const input = window.prompt('Add raw chars (no spaces):', '');
											if (input && onInsertRawCharsAfterPosition) onInsertRawCharsAfterPosition(fi, input);
										}}
										onSplitGroup={canSplitGroup ? onSplitGroup : undefined}
									/>
							))
						)}
					</div>
				</div>
			))}
		</div>
	);
}

export default MappingTable;
