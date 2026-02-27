import React, { useMemo, useRef } from 'react';
import { Grid } from 'react-window';
import type { MappingTableProps } from '../types';
import OTCell from './OTCell';
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
 * Renders the OT→ZT allocation grid using react-window virtualization.
 * Only visible cells are rendered (massive performance improvement for large grids).
 *
 * This component accepts precomputed `columns` (preferred) but can also derive them
 * internally. Supporting both keeps the table resilient while letting the parent
 * share a single mapping computation across multiple views.
 */
function MappingTable(props: MappingTableProps & MappingTableExtraProps) {
 	const { otRows, ztTokens, lockedKeys, selections, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken, groupSize = 1, onInsertRawCharsAfterPosition, onSplitGroup, canInsertRaw = false, canSplitGroup = true, columns, shiftMeta, onShiftGroupLeft, onShiftGroupRight, activeDragType, activeOtSourceRow, activeOtSourceCol, activeZtTokenIndex, keysPerOTMode = 'single', bracketedIndices = [] } = props;

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

		return buildShiftOnlyColumns(otRows, ztTokens, normalizedLocks, normalizedSelections, groupSize, bracketedIndices);
	}, [columns, otRows, ztTokens, lockedKeys, selections, groupSize, bracketedIndices]);

	// Flat index of all cells (including deception) for shift operations in fixedLength mode
	const flatIndices = useMemo(() => {
		let counter = 0;
		return rows.map(row => row.map(() => {
			const idx = counter;
			counter++;
			return idx;
		}));
	}, [rows]);

	// Flat OT index - counts only OT cells (excludes deception) - for split operations
	const flatOtIndices = useMemo(() => {
		let counter = 0;
		return rows.map(row => row.map(col => {
			if (!col.ot || col.deception) return -1;
			const idx = counter;
			counter++;
			return idx;
		}));
	}, [rows]);

	// Owned raw ZT indices across the whole grid (used to decide whether a short group
	// can safely expand from its start without overlapping another cell).
	const allOwnedIndices = React.useMemo(() => {
		const allOwned = new Set<number>();
		for (let rr = 0; rr < rows.length; rr++) {
			for (let cc = 0; cc < rows[rr].length; cc++) {
				for (const idx of rows[rr][cc].zt) allOwned.add(idx);
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

				if (!col.zt || col.zt.length === 0 || col.zt.length >= groupSize) {
					map.set(key, false);
					continue;
				}

				const start = col.zt[0];
				let canExpand = true;
				for (let k = 1; k < groupSize; k++) {
					const idx = start + k;
					if (allOwnedIndices.has(idx) && !col.zt.includes(idx)) {
						canExpand = false;
						break;
					}
					if (idx >= ztTokens.length) {
						canExpand = false;
						break;
					}
				}
				map.set(key, canExpand);
			}
		}
		return map;
	}, [rows, groupSize, ztTokens.length, allOwnedIndices]);

	// Duplicate detection is based on *rendered* group text (not raw indices) so it matches
	// what users see and reason about when spotting collisions.
	const duplicateOTChars = React.useMemo(() => {
		const tokenToOTs: Record<string, Set<string>> = {};

		for (let rIdx = 0; rIdx < rows.length; rIdx++) {
			for (let cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
				const col = rows[rIdx][cIdx];
				if (!col.ot) continue;
				if (col.deception) continue;
				if (!col.zt || col.zt.length === 0) continue;

				// Match OTCell rendering rules: expand only when len==1 and allowExpandFromStart.
				let displayedIndices: number[] = [];
				if (groupSize > 1) {
					if (col.zt.length >= groupSize) {
						displayedIndices = col.zt.slice(0, groupSize);
					} else if (col.zt.length === 1 && (allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false)) {
						const start = col.zt[0];
						for (let k = 0; k < groupSize; k++) {
							const idx = start + k;
							if (idx < ztTokens.length) displayedIndices.push(idx);
						}
					} else {
						displayedIndices = col.zt.slice();
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
	}, [groupSize, rows, ztTokens, allowExpandMap]);

	// Use a single fixed-width grid so subsequent OT rows can visually continue
	// filling any remaining space on the last line (layout-only).
	const visualColumnsPerRow = React.useMemo(() => {
		let max = 1;
		for (const r of otRows) max = Math.max(max, r.length);
		return Math.max(1, max);
	}, [otRows]);

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
		// Must match OTCell display rules, otherwise locks/shifts look like they require double-click.
		const displayedIndices = (() => {
			if (!col.zt || col.zt.length === 0) return [] as number[];
			if (groupSize <= 1) return col.zt.slice();
			if (col.zt.length >= groupSize) return col.zt.slice(0, groupSize);
			if (col.zt.length === 1 && (allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false)) {
				const start = col.zt[0];
				const expanded: number[] = [];
				for (let k = 0; k < groupSize; k++) {
					const idx = start + k;
					if (idx < ztTokens.length) expanded.push(idx);
				}
				return expanded;
			}
			return col.zt.slice();
		})();

		const currentTokenText = displayedIndices.length
			? displayedIndices.map(i => ztTokens[i]?.text || '').join('')
			: '';

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
			<div style={{ ...style, padding: '2px' }} {...ariaAttributes}>
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
					flatOtIndex={flatOtIndices[rIdx][cIdx]}
					activeDragType={activeDragType}
					activeOtSourceRow={activeOtSourceRow}
					activeOtSourceCol={activeOtSourceCol}
					activeZtTokenIndex={activeZtTokenIndex}
					keysPerOTMode={keysPerOTMode}
					isTentative={Boolean(col.tentative)}
					lockedHomophonesCount={
						keysPerOTMode === 'multiple' && col.ot
							? (() => { const v = lockedKeys?.[col.ot!.ch]; return Array.isArray(v) ? v.length : v ? 1 : 0; })()
							: undefined
					}
					allowExpandFromStart={allowExpandMap.get(`${rIdx}-${cIdx}`) ?? false}
					onInsertAfterGroup={(fi) => {
						if (!canInsertRaw || fi < 0) return;
						const flatColumns: { otCh: string | null; indices: number[] }[] = [];
						for (const row of rows) for (const col of row) flatColumns.push({ otCh: col.ot ? col.ot.ch : null, indices: col.zt });
						const target = flatColumns[fi];
						if (!target || !target.otCh) return;
						const current = target && target.indices.length ? target.indices.map(i => ztTokens[i]?.text || '').join('') : '';
						const label = groupSize > 1 ? 'Edit raw chars for this group (no spaces):' : 'Insert/edit token for this OT (no spaces):';
						const input = window.prompt(label, current);
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
			</div>
		);
	}, [flatCells, columnCount, groupSize, ztTokens, lockedKeys, props.highlightedOTChar, onLockOT, onUnlockOT, onEditToken, duplicateOTChars, flatIndices, flatOtIndices, activeDragType, activeOtSourceRow, activeOtSourceCol, activeZtTokenIndex, allowExpandMap, canInsertRaw, rows, onInsertRawCharsAfterPosition, canSplitGroup, onSplitGroup, onShiftGroupLeft, onShiftGroupRight, shiftMeta]);

	if (rows.length === 0) {
		return (
			<div className="text-sm text-gray-400 italic p-4 text-center border border-dashed border-gray-200 rounded-lg">
				No data yet — enter OT and ZT text above and run analysis.
			</div>
		);
	}

	// Prefer Vite's `import.meta.env.DEV`, but guard for environments where `import.meta.env`
	// is not injected (e.g. some test runners / alternative bundlers).
	const isDev = ((import.meta as any)?.env?.DEV ?? false) as boolean;

	return (
		<div>
		{/* Color legend */}
		<div className="flex flex-wrap gap-3 mb-2 text-xs text-gray-500 select-none">
			<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-300"></span> Locked</span>
			<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Unlocked</span>
			<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-300"></span> Error / empty</span>
			<span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-purple-50 border border-purple-300"></span> Highlighted</span>
		</div>
		{hasDeceptionWarning && (
			<div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-300 rounded-lg px-3 py-2 mb-2">
				<svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
				<span>ZT has more tokens than OT characters — mark extra tokens as <strong>Null / Deception</strong> using the panel above.</span>
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
			{isDev ? (
				<div className="mt-2 p-2 bg-gray-100 text-xs">
					<div className="font-semibold text-sm mb-1">DEBUG: mapping (dev only)</div>
					<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
						{JSON.stringify({ rows: rows.map(r => r.map(c => ({ ot: c.ot ? c.ot.ch : null, zt: c.zt, deception: !!c.deception }))), bracketedIndices }, null, 2)}
					</pre>
				</div>
			) : null}
		</div>
		</div>
	);
}

MappingTable.displayName = 'MappingTable';

export default React.memo(MappingTable);
