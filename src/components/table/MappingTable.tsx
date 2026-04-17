import React, { useMemo, useRef } from 'react';
import { Grid } from 'react-window';
import type { MappingTableProps } from '../types';
import PTCell from './PTCell';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';
import { normalizeLocks } from '../../utils/frequency';
import { expandDisplayedIndices } from '../../utils/tokenHelpers';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { MappingCellContext, type MappingCellContextValue } from './MappingCellContext';
import PromptModal from '../common/PromptModal';
import dangerIcon from '../../assets/icons/danger.png';

const EMPTY_SELECTIONS: Record<string, string | string[] | null> = Object.freeze({});

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
	const { ptRows, ctTokens, lockedKeys, selections = EMPTY_SELECTIONS, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken, onEditPTAt, groupSize = 1, onInsertRawCharsAfterPosition, onSplitGroup, canInsertRaw = false, canSplitGroup = true, columns, shiftMeta, onShiftGroupLeft, onShiftGroupRight, activeDragType, activePtSourceRow, activePtSourceCol, activeCtTokenIndex, keysPerPTMode = 'single', bracketedIndices = [], activeCtIsFromNull = false, activeNullInsertedAfterBaseFlatIndex = null, activeCtSourceCellCount } = props;

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
		for (const [ch, val] of Object.entries(selections)) {
			normalizedSelections[ch] = Array.isArray(val) ? val[0] || null : (val ?? null);
		}

		return buildShiftOnlyColumns(ptRows, ctTokens, normalizedLocks, normalizedSelections, groupSize, bracketedIndices);
	}, [columns, ptRows, ctTokens, lockedKeys, selections, groupSize, bracketedIndices]);

	// Build grid metadata in one shared derivation to avoid repeated full-grid scans
	// across indexing, expansion checks, and duplicate detection.
	const { flatIndices, flatPtIndices, allowExpandMap, duplicatePTChars } = useMemo(() => {
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
				for (const idx of col.ct) {
					if (idx < 0 || idx >= ctTokens.length) continue;
					owned.add(idx);
				}
			}
			fi.push(fiRow);
			fpi.push(fpiRow);
		}

		const map = new Map<string, boolean>();
		const tokenToOTs = new Map<string, Set<string>>();
		for (let rIdx = 0; rIdx < rows.length; rIdx++) {
			for (let cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
				const col = rows[rIdx][cIdx];
				const key = `${rIdx}-${cIdx}`;
				let canExpand = false;

				if (groupSize > 1) {
					if (!col.ct || col.ct.length === 0 || col.ct.length >= groupSize) {
						map.set(key, false);
					} else {
						const start = col.ct[0];
						if (start < 0 || start >= ctTokens.length) {
							map.set(key, false);
						} else {
							const cellCtSet = new Set(col.ct);
							canExpand = true;
							for (let k = 1; k < groupSize; k++) {
								const idx = start + k;
								if (owned.has(idx) && !cellCtSet.has(idx)) {
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
				}

				if (!col.pt || col.deception || !col.ct || col.ct.length === 0) continue;

				const displayedIndices = expandDisplayedIndices(
					col.ct,
					groupSize,
					groupSize > 1 ? canExpand : false,
					ctTokens.length,
				);

				let groupText = '';
				for (let i = 0; i < displayedIndices.length; i++) {
					groupText += ctTokens[displayedIndices[i]]?.text ?? '';
				}
				if (!groupText.trim()) continue;

				const ots = tokenToOTs.get(groupText);
				if (ots) ots.add(col.pt.ch);
				else tokenToOTs.set(groupText, new Set([col.pt.ch]));
			}
		}

		const dup = new Set<string>();
		for (const ots of tokenToOTs.values()) {
			if (ots.size <= 1) continue;
			for (const pt of ots) dup.add(pt);
		}

		return {
			flatIndices: fi,
			flatPtIndices: fpi,
			allowExpandMap: map,
			duplicatePTChars: dup,
		};
	}, [rows, groupSize, ctTokens]);

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

	const flatColumns = useMemo(() => {
		const result: { ptCh: string | null; indices: number[] }[] = [];
		for (const row of rows) {
			for (const col of row) {
				result.push({ ptCh: col.pt ? col.pt.ch : null, indices: col.ct });
			}
		}
		return result;
	}, [rows]);

	const ptOnlyIndexByFlat = useMemo(() => {
		const result: number[] = [];
		let ptCounter = 0;
		for (let i = 0; i < flatColumns.length; i++) {
			result[i] = ptCounter;
			if (flatColumns[i].ptCh != null) ptCounter++;
		}
		return result;
	}, [flatColumns]);

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
	const gridCellProps = useMemo(() => ({}), []);

	// State for the non-blocking insert/edit modal (replaces window.prompt in the Cell callback)
	const [insertPrompt, setInsertPrompt] = React.useState<{
		currentCT: string;
		currentPT: string;
		ctLabel: string;
		ptLabel: string;
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
						const target = flatColumns[fi];
						if (!target || !target.ptCh) return;
						const currentCT = target.indices.length ? target.indices.map(i => ctTokens[i]?.text || '').join('') : '';
						const currentPT = target.ptCh;
						const ctLabel = groupSize > 1 ? 'CT raw chars for this group (no spaces):' : 'CT token for this PT (no spaces):';
						const ptLabel = 'PT text for this cell (leave empty to remove PT cell):';
						const ptOnlyIndex = ptOnlyIndexByFlat[fi] ?? 0;
						setInsertPrompt({ currentCT, currentPT, ctLabel, ptLabel, ptOnlyIndex });
					}}
				/>
			</div>
		);
	}, [flatCells, columnCount, duplicatePTChars, flatIndices, flatPtIndices, allowExpandMap, canInsertRaw, flatColumns, ctTokens, groupSize, ptOnlyIndexByFlat]);

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
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Tentative</span>
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-300"></span> Error / empty</span>
				<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-purple-50 border border-purple-300"></span> Highlighted</span>
			</div>
			{hasDeceptionWarning && (
				<div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-300 rounded-lg px-3 py-2 mb-2">
					<img src={dangerIcon} alt="" aria-hidden="true" className="w-4 h-4 flex-shrink-0" />
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
					cellProps={gridCellProps}
				/>
			</div>
			<PromptModal
				isOpen={insertPrompt !== null}
				title="Edit PT and CT Cell"
				label={insertPrompt?.ptLabel ?? ''}
				initialValue={insertPrompt?.currentPT ?? ''}
				secondaryLabel={insertPrompt?.ctLabel ?? ''}
				secondaryInitialValue={insertPrompt?.currentCT ?? ''}
				onConfirm={(ptValue, ctValue) => {
					if (insertPrompt) {
						onEditPTAt?.(insertPrompt.ptOnlyIndex, ptValue ?? '');
						onInsertRawCharsAfterPosition?.(insertPrompt.ptOnlyIndex, ctValue ?? '', true);
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
