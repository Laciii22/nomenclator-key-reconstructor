import React, { useMemo } from 'react';
import type { MappingTableProps } from '../types';
import OTCell from './OTCell';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';

type MappingTableExtraProps = {
	groupSize?: number;
	onInsertRawCharsAfterPosition?: (positionIndex: number, text: string, replace?: boolean) => void;
	onSplitGroup?: (flatIndex: number) => void;
	canInsertRaw?: boolean;
	canSplitGroup?: boolean;
};

/**
 * Renders the OT→ZT allocation grid.
 *
 * This component accepts precomputed `columns` (preferred) but can also derive them
 * internally. Supporting both keeps the table resilient while letting the parent
 * share a single mapping computation across multiple views.
 */
function MappingTable(props: MappingTableProps & MappingTableExtraProps) {
	const { otRows, ztTokens, lockedKeys, selections, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken, groupSize = 1, onInsertRawCharsAfterPosition, onSplitGroup, canInsertRaw = false, canSplitGroup = true, columns, shiftMeta, onShiftGroupLeft, onShiftGroupRight } = props;

	const rows = useMemo(() => {
		if (columns && columns.length) return columns;
		
		// Fallback: normalize multi-key to single-key for buildShiftOnlyColumns
		const normalizedLocks: Record<string, string> = {};
		for (const [ch, val] of Object.entries(lockedKeys || {})) {
			normalizedLocks[ch] = Array.isArray(val) ? val[0] || '' : val;
		}
		const normalizedSelections: Record<string, string | null> = {};
		for (const [ch, val] of Object.entries(selections || {})) {
			normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
		}
		
		return buildShiftOnlyColumns(otRows, ztTokens, normalizedLocks, normalizedSelections, groupSize);
	}, [columns, otRows, ztTokens, lockedKeys, selections, groupSize]);

	// Flat index of all cells (including deception) for shift operations in fixedLength mode
	const flatIndices = useMemo(() => {
		let counter = 0;
		return rows.map(row => row.map(col => {
			const idx = counter;
			counter++;
			return idx;
		}));
	}, [rows]);

	// Duplicate detection is based on *rendered* group text (not raw indices) so it matches
	// what users see and reason about when spotting collisions.
	const duplicateOTChars = useMemo(() => {
		const tokenToOTs: Record<string, Set<string>> = {};
		for (let rIdx = 0; rIdx < rows.length; rIdx++) {
			for (let cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
				const col = rows[rIdx][cIdx];
				if (!col.ot) continue;
				if (col.deception) continue;
				if (!col.zt || col.zt.length === 0) continue;

				// Reproduce OTCell's displayed-index logic so duplicates align with the UI.
				let displayedIndices: number[] = [];
				if (groupSize > 1) {
					if (col.zt.length >= groupSize) {
						displayedIndices = col.zt.slice(0, groupSize);
					} else {
						// compute allowExpandFromStart (same rules as in the JSX below)
						const start = col.zt[0];
						const otherOwned = new Set<number>();
						for (let rr = 0; rr < rows.length; rr++) {
							for (let cc = 0; cc < rows[rr].length; cc++) {
								if (rr === rIdx && cc === cIdx) continue;
								for (const idx of rows[rr][cc].zt) otherOwned.add(idx);
							}
						}
						let allowExpand = true;
						for (let k = 1; k < groupSize; k++) {
							const idx = start + k;
							if (otherOwned.has(idx)) { allowExpand = false; break; }
							if (idx >= ztTokens.length) { allowExpand = false; break; }
						}
						if (col.zt.length === 1 && allowExpand) {
							for (let k = 0; k < groupSize; k++) {
								const idx = start + k;
								if (idx < ztTokens.length) displayedIndices.push(idx);
							}
						} else {
							displayedIndices = col.zt.slice();
						}
					}
				} else {
					displayedIndices = col.zt.slice();
				}

				const groupText = displayedIndices.map(i => ztTokens[i]?.text ?? '').join('').trim();
				if (!groupText) continue;
				(tokenToOTs[groupText] ||= new Set()).add(col.ot.ch);
			}
		}

		const dup = new Set<string>();
		for (const ots of Object.values(tokenToOTs)) {
			if (ots.size <= 1) continue;
			for (const ot of ots) dup.add(ot);
		}
		return dup;
	}, [groupSize, rows, ztTokens]);

	// Use a single fixed-width grid so subsequent OT rows can visually continue
	// filling any remaining space on the last line (layout-only).
	const visualColumnsPerRow = useMemo(() => {
		let max = 1;
		for (const r of otRows) max = Math.max(max, r.length);
		return Math.max(1, max);
	}, [otRows]);

	return (
		<div className={`${hasDeceptionWarning ? 'border border-red-300 rounded p-2 bg-red-50' : ''}`}>
			<div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: `repeat(${visualColumnsPerRow}, minmax(0, 1fr))` }}>
				{rows.length === 0 ? (
					<div className="text-gray-400 text-sm">(empty)</div>
				) : (
					rows.flatMap((cols, rIdx) =>
						cols.map((col, cIdx) => {
							// Get actual token text for this cell
							const currentTokenText = (() => {
								if (!col.zt || col.zt.length === 0) return '';
								if (groupSize === 1) {
									return ztTokens[col.zt[0]]?.text || '';
								}
								return col.zt.map(i => ztTokens[i]?.text || '').join('');
							})();
							
							// Check if this specific token is in the locked homophones
							const lockedHomophones = col.ot ? lockedKeys?.[col.ot.ch] : undefined;
							const isThisTokenLocked = (() => {
								if (!col.ot || !lockedHomophones || !currentTokenText) return false;
								if (Array.isArray(lockedHomophones)) {
									return lockedHomophones.includes(currentTokenText);
								}
								return lockedHomophones === currentTokenText;
							})();
							
							return (
							<OTCell
								highlightedOTChar={props.highlightedOTChar}
								key={`${rIdx}-${cIdx}`}
								ot={col.ot ?? null}
								tokens={ztTokens}
								tokenIndices={col.zt}
								row={rIdx}
								col={cIdx}
								onLockOT={onLockOT}
								onUnlockOT={onUnlockOT}
								lockedValue={isThisTokenLocked ? currentTokenText : undefined}
								deception={Boolean(col.deception || col.ot == null)}
								hasDuplicateKey={Boolean(col.ot && duplicateOTChars.has(col.ot.ch))}
								onEditToken={onEditToken}
								isFixedLength={groupSize > 1}
								groupSize={groupSize}
								flatIndex={flatIndices[rIdx][cIdx]}
								// Only allow auto-expansion when it won't steal indices from other cells.
								allowExpandFromStart={(() => {
									if (!col.zt || col.zt.length === 0) return false;
									if (col.zt.length >= groupSize) return false; // already full
									if (groupSize <= 1) return false;
									const start = col.zt[0];
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
										if (idx >= ztTokens.length) return false;
									}
									return true;
								})()}
								onInsertAfterGroup={(fi) => {
									if (!canInsertRaw || fi < 0) return;
									const flatColumns: { otCh: string | null; indices: number[] }[] = [];
									for (const row of rows) for (const col of row) flatColumns.push({ otCh: col.ot ? col.ot.ch : null, indices: col.zt });
									const target = flatColumns[fi];
									if (!target || !target.otCh) return; // Skip deception cells for insert
									const current = target && target.indices.length ? target.indices.map(i => ztTokens[i]?.text || '').join('') : '';
									const label = groupSize > 1 ? 'Edit raw chars for this group (no spaces):' : 'Insert/edit token for this OT (no spaces):';
									const input = window.prompt(label, current);
									// Convert flatIndex (all cells) to OT-only position for onInsertRawCharsAfterPosition
									const otOnlyIndex = flatColumns.slice(0, fi).filter(f => f.otCh != null).length;
									if (input != null && onInsertRawCharsAfterPosition) onInsertRawCharsAfterPosition(otOnlyIndex, input, true);
								}}
								onSplitGroup={canSplitGroup ? onSplitGroup : undefined}
								onShiftLeft={onShiftGroupLeft}
								onShiftRight={onShiftGroupRight}
								canShiftLeft={(() => {
									const fi = flatIndices[rIdx][cIdx];
									if (!shiftMeta || fi < 0) return false;
									return !!shiftMeta[fi]?.canShiftLeft;
								})()}
								canShiftRight={(() => {
									const fi = flatIndices[rIdx][cIdx];
									if (!shiftMeta || fi < 0) return false;
									return !!shiftMeta[fi]?.canShiftRight;
								})()}
							/>
							);
						}),
					)
				)}
			</div>
		</div>
	);
}

MappingTable.displayName = 'MappingTable';

export default React.memo(MappingTable);
