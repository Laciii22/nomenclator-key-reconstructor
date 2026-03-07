import React, { useMemo, useRef } from 'react';
import { Grid } from 'react-window';
import type { MappingTableProps } from '../types';
import PTCell from './PTCell';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';
import { normalizeLocks } from '../../utils/frequency';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { MappingCellContext, type MappingCellContextValue } from './MappingCellContext';
import PromptModal from '../common/PromptModal';

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
	const { ptRows, ctTokens, lockedKeys, selections, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken, groupSize = 1, onInsertRawCharsAfterPosition, onSplitGroup, canInsertRaw = false, canSplitGroup = true, columns, shiftMeta, onShiftGroupLeft, onShiftGroupRight, activeDragType, activePtSourceRow, activePtSourceCol, activeCtTokenIndex, keysPerPTMode = 'single', bracketedIndices = [], activeCtIsFromNull = false, activeNullInsertedAfterBaseFlatIndex = null, activeCtSourceCellCount } = props;

	const rows = useMemo(() => {
		if (columns && columns.length) return columns;

		// Fallback: columns prop was not provided. Prefer passing precomputed
		// `columns` from useMapping for accuracy and to avoid duplicate work.
		if (import.meta.env.DEV) {
			console.warn(
				'[MappingTable] No precomputed columns provided; falling back to internal computation. '
				+ 'Pass `columns` from useMapping for best performance and accuracy.'
			);
		}

		// Fallback: normalize multi-key to single-key for buildShiftOnlyColumns
		const normalizedLocks = normalizeLocks(lockedKeys);
		const normalizedSelections: Record<string, string | null> = {};
		for (const [ch, val] of Object.entries(selections || {})) {
			normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
		}

		return buildShiftOnlyColumns(ptRows, ctTokens, normalizedLocks, normalizedSelections, groupSize, bracketedIndices);
	}, [columns, ptRows, ctTokens, lockedKeys, selections, groupSize, bracketedIndices]);

	// Flat index of all cells (including deception), flat PT-only index, and owned CT
	// indices — all derived from `rows` — computed in a single traversal to avoid
	// iterating the grid three separate times when rows change.
	const { flatIndices, flatPtIndices, allOwnedIndices } = useMemo(() => {
		let allCounter = 0;
		let ptCounter = 0;
		const fi: number[][] = [];
		const fpi: number[][] = [];
		const owned = new Set<number>();

		for (let r = 0; r < rows.length; r++) {
			const fiRow: number[] = [];
			const fpiRow: number[] = [];
			for (let c = 0; c < rows[r].length; c++) {
				const col = rows[r][c];
				fiRow.push(allCounter++);
				if (col.pt && !col.deception) {
					fpiRow.push(ptCounter++);
				} else {
					fpiRow.push(-1);
				}
				for (const idx of col.ct) owned.add(idx);
			}
			fi.push(fiRow);
			fpi.push(fpiRow);
		}

		return { flatIndices: fi, flatPtIndices: fpi, allOwnedIndices: owned };
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
	const viewportWidth = useViewportWidth(150);

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
	const getCellWidth = React.useCallback(() => {
		if (!containerRef.current) return 120;
		const containerWidth = containerRef.current.clientWidth;
		const padding = 8; // container padding
		const availableWidth = containerWidth - padding;
		return Math.max(50, Math.floor(availableWidth / effectiveColumnCount));
	}, [effectiveColumnCount]);

	const [cellWidth, setCellWidth] = React.useState(120);

	React.useEffect(() => {
		const updateWidth = () => {
			setCellWidth(getCellWidth());
		};
		updateWidth();
		const timer = setTimeout(updateWidth, 100); // delay for container mount
		return () => clearTimeout(timer);
	}, [getCellWidth, viewportWidth]);

	const columnCount = effectiveColumnCount;
	const rowCount = Math.ceil(flatCells.length / columnCount);

	// State for the non-blocking insert/edit modal (replaces window.prompt in the Cell callback)
	const [insertPrompt, setInsertPrompt] = React.useState<{
		current: string;
		label: string;
		ptOnlyIndex: number;
	} | null>(null);

	// Stable context value shared across all PTCell instances rendered by this grid.
	// Placing these in context eliminates the need to pass them as per-cell props.
	const ctxValue = useMemo((): MappingCellContextValue => ({
		ctTokens,
		lockedKeys: lockedKeys ?? {},
		groupSize,
		keysPerPTMode: keysPerPTMode ?? 'single',
		highlightedPTChar: props.highlightedPTChar,
		onLockOT,
		onUnlockOT,
		onEditToken,
		onSplitGroup: canSplitGroup ? onSplitGroup : undefined,
		onShiftGroupLeft,
		onShiftGroupRight,
		activeDragType,
		activePtSourceRow,
		activePtSourceCol,
		activeCtTokenIndex,
		shiftMeta,
		activeCtIsFromNull,
		activeNullInsertedAfterBaseFlatIndex,
		activeCtSourceCellCount,
	}), [
		ctTokens,
		lockedKeys,
		groupSize,
		keysPerPTMode,
		props.highlightedPTChar,
		onLockOT,
		onUnlockOT,
		onEditToken,
		canSplitGroup,
		onSplitGroup,
		onShiftGroupLeft,
		onShiftGroupRight,
		activeDragType,
		activePtSourceRow,
		activePtSourceCol,
		activeCtTokenIndex,
		shiftMeta,
		activeCtIsFromNull,
		activeNullInsertedAfterBaseFlatIndex,
		activeCtSourceCellCount,
	]);
	const Cell = React.useCallback(({ columnIndex, rowIndex, style, ariaAttributes }: {
		columnIndex: number;
		rowIndex: number;
		style: React.CSSProperties;
		ariaAttributes: { 'aria-colindex': number; role: 'gridcell' };
	}) => {
		const flatIdx = rowIndex * columnCount + columnIndex;
		if (flatIdx >= flatCells.length) return <div style={style} />;

		const { rIdx, cIdx, col } = flatCells[flatIdx];

		// Per-cell props only; grid-level values are provided via MappingCellContext.
		return (
			<div style={{ ...style, padding: '2px' }} {...ariaAttributes}>
				<PTCell
					key={`${rIdx}-${cIdx}`}
					pt={col.pt ?? null}
					tokenIndices={col.ct}
					row={rIdx}
					col={cIdx}
					deception={Boolean(col.deception || col.pt == null)}
					hasDuplicateKey={Boolean(col.pt && duplicatePTChars.has(col.pt.ch))}
					flatIndex={flatIndices[rIdx][cIdx]}
					flatPtIndex={flatPtIndices[rIdx][cIdx]}
					isTentative={Boolean(col.tentative)}
					allowExpandFromStart={allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false}
					baseFlatIndex={col.baseFlatIdx}
					nullInsertedAfterBaseFlatIdx={col.insertedAfterBaseFlatIndex}
					onInsertAfterGroup={(fi) => {
						if (!canInsertRaw || fi < 0) return;
						const flatColumns: { ptCh: string | null; indices: number[] }[] = [];
						for (const row of rows) for (const col of row) flatColumns.push({ ptCh: col.pt ? col.pt.ch : null, indices: col.ct });
						const target = flatColumns[fi];
						if (!target || !target.ptCh) return;
						const current = target.indices.length ? target.indices.map(i => ctTokens[i]?.text || '').join('') : '';
						const label = groupSize > 1 ? 'Edit raw chars for this group (no spaces):' : 'Insert/edit token for this PT (no spaces):';
						const ptOnlyIndex = flatColumns.slice(0, fi).filter(f => f.ptCh != null).length;
						setInsertPrompt({ current, label, ptOnlyIndex });
					}}
				/>
			</div>
		);
	}, [flatCells, columnCount, duplicatePTChars, flatIndices, flatPtIndices, allowExpandMap, canInsertRaw, rows, ctTokens, groupSize]);

	if (rows.length === 0) {
		return (
			<div className="text-sm text-gray-400 italic p-4 text-center border border-dashed border-gray-200 rounded-lg">
				No data yet — enter PT and CT text above and run analysis.
			</div>
		);
	}

	return (
		<MappingCellContext.Provider value={ctxValue}>
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
			<PromptModal
				isOpen={insertPrompt !== null}
				title="Edit CT Token"
				label={insertPrompt?.label ?? ''}
				initialValue={insertPrompt?.current ?? ''}
				onConfirm={(value) => {
					if (insertPrompt && onInsertRawCharsAfterPosition) {
						onInsertRawCharsAfterPosition(insertPrompt.ptOnlyIndex, value, true);
					}
					setInsertPrompt(null);
				}}
				onCancel={() => setInsertPrompt(null)}
			/>
		</div>
		</MappingCellContext.Provider>
	);
}

MappingTable.displayName = 'MappingTable';

export default React.memo(MappingTable);
