import React, { useMemo, useRef } from 'react';
import { Grid } from 'react-window';
import type { MappingTableProps } from '../types';
import PTCell from './PTCell';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';

type MappingTableExtraProps = {
	groupSize?: number;
	onInsertRawCharsAfterPosition?: (positionIndex: number, text: string, replace?: boolean) => void;
	onSplitGroup?: (flatIndex: number) => void;
	canInsertRaw?: boolean;
	canSplitGroup?: boolean;
	bracketedIndices?: number[];
};

/**
 * Renders the PT→CT allocation grid using react-window virtualization.
 * Only visible cells are rendered (massive performance improvement for large grids).
 *
 * This component accepts precomputed `columns` (preferred) but can also derive them
 * internally. Supporting both keeps the table resilient while letting the parent
 * share a single mapping computation across multiple views.
 */
function MappingTable(props: MappingTableProps & MappingTableExtraProps) {
	const { ptRows, ctTokens, lockedKeys, selections, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken, groupSize = 1, onInsertRawCharsAfterPosition, onSplitGroup, canInsertRaw = false, canSplitGroup = true, columns, shiftMeta, onShiftGroupLeft, onShiftGroupRight, activeDragType, activePtSourceRow, activePtSourceCol, activeCtTokenIndex, keysPerPTMode = 'single', bracketedIndices = [] } = props;

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

		return buildShiftOnlyColumns(ptRows, ctTokens, normalizedLocks, normalizedSelections, groupSize, bracketedIndices);
	}, [columns, ptRows, ctTokens, lockedKeys, selections, groupSize, bracketedIndices]);

	// Flat index of all cells (including deception) for shift operations in fixedLength mode
	const flatIndices = useMemo(() => {
		let counter = 0;
		return rows.map(row => row.map(() => {
			const idx = counter;
			counter++;
			return idx;
		}));
	}, [rows]);

	// Flat PT index - counts only PT cells (excludes deception) - for split operations
	const flatPtIndices = useMemo(() => {
		let counter = 0;
		return rows.map(row => row.map(col => {
			if (!col.pt || col.deception) return -1;
			const idx = counter;
			counter++;
			return idx;
		}));
	}, [rows]);

	// Owned raw CT indices across the whole grid (used to decide whether a short group
	// can safely expand from its start without overlapping another cell).
	const allOwnedIndices = React.useMemo(() => {
		const allOwned = new Set<number>();
		for (let rr = 0; rr < rows.length; rr++) {
			for (let cc = 0; cc < rows[rr].length; cc++) {
				for (const idx of rows[rr][cc].ct) allOwned.add(idx);
			}
		}
		return allOwned;
	}, [rows]);

	// Pre-compute allowExpandFromStart for all cells to avoid O(n²) in render
	const allowExpandMap = useMemo(() => {
		if (groupSize <= 1) return new Map<string, boolean>();

		const map = new Map<string, boolean>();
		for (let rIdx = 0; rIdx < rows.length; rIdx++) {
			for (let cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
				const col = rows[rIdx][cIdx];
				const key = `${rIdx}-${cIdx}`;

				if (!col.ct || col.ct.length === 0 || col.ct.length >= groupSize) {
					map.set(key, false);
					continue;
				}

				const start = col.ct[0];
				let canExpand = true;
				for (let k = 1; k < groupSize; k++) {
					const idx = start + k;
					if (allOwnedIndices.has(idx) && !col.ct.includes(idx)) {
						canExpand = false;
						break;
					}
					if (idx >= ctTokens.length) {
						canExpand = false;
						break;
					}
				}
				map.set(key, canExpand);
			}
		}
		return map;
	}, [rows, groupSize, ctTokens.length, allOwnedIndices]);

	// Duplicate detection is based on *rendered* group text (not raw indices) so it matches
	// what users see and reason about when spotting collisions.
	const duplicatePTChars = React.useMemo(() => {
		const tokenToOTs: Record<string, Set<string>> = {};

		for (let rIdx = 0; rIdx < rows.length; rIdx++) {
			for (let cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
				const col = rows[rIdx][cIdx];
				if (!col.pt) continue;
				if (col.deception) continue;
				if (!col.ct || col.ct.length === 0) continue;

				// Match PTCell rendering rules: expand only when len==1 and allowExpandFromStart.
				let displayedIndices: number[] = [];
				if (groupSize > 1) {
					if (col.ct.length >= groupSize) {
						displayedIndices = col.ct.slice(0, groupSize);
					} else if (col.ct.length === 1 && (allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false)) {
						const start = col.ct[0];
						for (let k = 0; k < groupSize; k++) {
							const idx = start + k;
							if (idx < ctTokens.length) displayedIndices.push(idx);
						}
					} else {
						displayedIndices = col.ct.slice();
					}
				} else {
					displayedIndices = col.ct.slice();
				}

				const groupText = displayedIndices.map(i => ctTokens[i]?.text ?? '').join('').trim();
				if (!groupText) continue;
				(tokenToOTs[groupText] ||= new Set()).add(col.pt.ch);
			}
		}

		const dup = new Set<string>();
		for (const ots of Object.values(tokenToOTs)) {
			if (ots.size <= 1) continue;
			for (const pt of ots) dup.add(pt);
		}
		return dup;
	}, [groupSize, rows, ctTokens, allowExpandMap]);

	// Use a single fixed-width grid so subsequent PT rows can visually continue
	// filling any remaining space on the last line (layout-only).
	const visualColumnsPerRow = React.useMemo(() => {
		let max = 1;
		for (const r of ptRows) max = Math.max(max, r.length);
		return Math.max(1, max);
	}, [ptRows]);

	// Responsive column count based on viewport width
	const [viewportWidth, setViewportWidth] = React.useState(() =>
		typeof window === 'undefined' ? 1200 : window.innerWidth
	);

	React.useEffect(() => {
		if (typeof window === 'undefined') return;
		let timeoutId: number | null = null;
		const onResize = () => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				setViewportWidth(window.innerWidth);
			}, 150) as unknown as number;
		};
		window.addEventListener('resize', onResize, { passive: true } as any);
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			window.removeEventListener('resize', onResize);
		};
	}, []);

	// Calculate how many columns can fit without horizontal scroll
	const MIN_CELL_WIDTH = 75; // minimum cell width in pixels
	const CONTAINER_PADDING = 16; // total horizontal padding
	const maxColumnsThatFit = Math.max(1, Math.floor((viewportWidth - CONTAINER_PADDING) / MIN_CELL_WIDTH));

	// Use the smaller of: what fits in viewport vs actual data columns
	const effectiveColumnCount = Math.min(maxColumnsThatFit, visualColumnsPerRow);

	// Flatten grid into single array for react-window
	const flatCells = useMemo(() => {
		const result: Array<{
			rIdx: number;
			cIdx: number;
			col: typeof rows[0][0];
		}> = [];
		for (let rIdx = 0; rIdx < rows.length; rIdx++) {
			for (let cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
				result.push({ rIdx, cIdx, col: rows[rIdx][cIdx] });
			}
		}
		return result;
	}, [rows]);

	// Grid dimensions
	const containerRef = useRef<HTMLDivElement>(null);
	const CELL_HEIGHT = 65; // approximate height per cell in pixels

	// Calculate cell width to fit all columns without horizontal scroll
	const getCellWidth = () => {
		if (!containerRef.current) return 120;
		const containerWidth = containerRef.current.clientWidth;
		const padding = 8; // container padding
		const availableWidth = containerWidth - padding;
		return Math.max(50, Math.floor(availableWidth / effectiveColumnCount));
	};

	const [cellWidth, setCellWidth] = React.useState(120);

	React.useEffect(() => {
		const updateWidth = () => {
			setCellWidth(getCellWidth());
		};
		updateWidth();
		const timer = setTimeout(updateWidth, 100); // delay for container mount
		return () => clearTimeout(timer);
	}, [effectiveColumnCount, viewportWidth]);

	const columnCount = effectiveColumnCount;
	const rowCount = Math.ceil(flatCells.length / columnCount);

	// Cell renderer for react-window
	const Cell = React.useCallback(({ columnIndex, rowIndex, style, ariaAttributes }: {
		columnIndex: number;
		rowIndex: number;
		style: React.CSSProperties;
		ariaAttributes: { 'aria-colindex': number; role: 'gridcell' };
	}) => {
		const flatIdx = rowIndex * columnCount + columnIndex;
		if (flatIdx >= flatCells.length) return <div style={style} />;

		const { rIdx, cIdx, col } = flatCells[flatIdx];

		// Get displayed token indices/text for this cell.
		// Must match PTCell display rules, otherwise locks/shifts look like they require double-click.
		const displayedIndices = (() => {
			if (!col.ct || col.ct.length === 0) return [] as number[];
			if (groupSize <= 1) return col.ct.slice();
			if (col.ct.length >= groupSize) return col.ct.slice(0, groupSize);
			if (col.ct.length === 1 && (allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false)) {
				const start = col.ct[0];
				const expanded: number[] = [];
				for (let k = 0; k < groupSize; k++) {
					const idx = start + k;
					if (idx < ctTokens.length) expanded.push(idx);
				}
				return expanded;
			}
			return col.ct.slice();
		})();

		const currentTokenText = displayedIndices.length
			? displayedIndices.map(i => ctTokens[i]?.text || '').join('')
			: '';

		// Check if this specific token is in the locked homophones
		const lockedHomophones = col.pt ? lockedKeys?.[col.pt.ch] : undefined;
		const isThisTokenLocked = (() => {
			if (!col.pt || !lockedHomophones || !currentTokenText) return false;
			if (Array.isArray(lockedHomophones)) {
				return lockedHomophones.includes(currentTokenText);
			}
			return lockedHomophones === currentTokenText;
		})();

		return (
			<div style={{ ...style, padding: '2px' }} {...ariaAttributes}>
				<PTCell
					highlightedPTChar={props.highlightedPTChar}
					key={`${rIdx}-${cIdx}`}
					pt={col.pt ?? null}
					tokens={ctTokens}
					tokenIndices={col.ct}
					row={rIdx}
					col={cIdx}
					onLockOT={onLockOT}
					onUnlockOT={onUnlockOT}
					lockedValue={isThisTokenLocked ? currentTokenText : undefined}
					deception={Boolean(col.deception || col.pt == null)}
					hasDuplicateKey={Boolean(col.pt && duplicatePTChars.has(col.pt.ch))}
					onEditToken={onEditToken}
					isFixedLength={groupSize > 1}
					groupSize={groupSize}
					flatIndex={flatIndices[rIdx][cIdx]}
					flatPtIndex={flatPtIndices[rIdx][cIdx]}
					activeDragType={activeDragType}
					activePtSourceRow={activePtSourceRow}
					activePtSourceCol={activePtSourceCol}
					activeCtTokenIndex={activeCtTokenIndex}
					keysPerPTMode={keysPerPTMode}
					isTentative={Boolean(col.tentative)}
					lockedHomophonesCount={
						keysPerPTMode === 'multiple' && col.pt
							? (() => { const v = lockedKeys?.[col.pt!.ch]; return Array.isArray(v) ? v.length : v ? 1 : 0; })()
							: undefined
					}
					allowExpandFromStart={allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false}
					onInsertAfterGroup={(fi) => {
						if (!canInsertRaw || fi < 0) return;
						const flatColumns: { ptCh: string | null; indices: number[] }[] = [];
						for (const row of rows) for (const col of row) flatColumns.push({ ptCh: col.pt ? col.pt.ch : null, indices: col.ct });
						const target = flatColumns[fi];
						if (!target || !target.ptCh) return;
						const current = target && target.indices.length ? target.indices.map(i => ctTokens[i]?.text || '').join('') : '';
						const label = groupSize > 1 ? 'Edit raw chars for this group (no spaces):' : 'Insert/edit token for this PT (no spaces):';
						const input = window.prompt(label, current);
						const ptOnlyIndex = flatColumns.slice(0, fi).filter(f => f.ptCh != null).length;
						if (input != null && onInsertRawCharsAfterPosition) onInsertRawCharsAfterPosition(ptOnlyIndex, input, true);
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
			</div>
		);
	}, [flatCells, columnCount, groupSize, ctTokens, lockedKeys, props.highlightedPTChar, onLockOT, onUnlockOT, onEditToken, duplicatePTChars, flatIndices, flatPtIndices, activeDragType, activePtSourceRow, activePtSourceCol, activeCtTokenIndex, allowExpandMap, canInsertRaw, rows, onInsertRawCharsAfterPosition, canSplitGroup, onSplitGroup, onShiftGroupLeft, onShiftGroupRight, shiftMeta]);

	if (rows.length === 0) {
		return (
			<div className="text-sm text-gray-400 italic p-4 text-center border border-dashed border-gray-200 rounded-lg">
				No data yet — enter PT and CT text above and run analysis.
			</div>
		);
	}


	return (
		<div>
			<div className="flex flex-wrap gap-3 mb-2 text-xs text-gray-500 select-none">
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-300"></span> Locked</span>
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Unlocked</span>
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-300"></span> Error / empty</span>
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-purple-50 border border-purple-300"></span> Highlighted</span>
			</div>
			{hasDeceptionWarning && (
				<div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-300 rounded-lg px-3 py-2 mb-2">
					<svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
					<span>CT has more tokens than PT characters — mark extra tokens as <strong>Null / Deception</strong> using the panel above.</span>
				</div>
			)}
			<div
				ref={containerRef}
				style={{
					width: '100%',
					minHeight: '200px',
					height: rowCount * CELL_HEIGHT,
					overflowY: 'auto',
				}}
			>
				<Grid
					columnCount={columnCount}
					columnWidth={cellWidth}
					rowCount={rowCount}
					rowHeight={CELL_HEIGHT}
					cellComponent={Cell}
					cellProps={{}}
				/>
			</div>
		</div>
	);
}

MappingTable.displayName = 'MappingTable';

export default React.memo(MappingTable);
