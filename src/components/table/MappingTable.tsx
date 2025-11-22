import { useMemo } from 'react';
import type { MappingTableProps } from '../types';
import OTCell from './OTCell';
import { buildShiftOnlyColumns } from '../../utils/shiftMapping';

function MappingTable(props: MappingTableProps) {
	const { otRows, ztTokens, lockedKeys, selections, hasDeceptionWarning, onLockOT, onUnlockOT, onEditToken } = props;

	const rows = useMemo(() => buildShiftOnlyColumns(otRows, ztTokens, lockedKeys, selections), [otRows, ztTokens, lockedKeys, selections]);

	return (
		<div className={`space-y-4 ${hasDeceptionWarning ? 'border border-orange-300 rounded p-2 bg-orange-50' : ''}`}>
			{rows.map((cols, rIdx) => (
				<div key={rIdx} className="mb-4">
					<div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` }}>
						{cols.length === 0 ? (
							<div className="text-gray-400 text-sm">(prázdny riadok)</div>
						) : (
							cols.map((col, cIdx) => (
								<OTCell
									key={cIdx}
									ot={col.ot ?? null}
									tokens={col.zt.map(i => ztTokens[i])}
									tokenIndices={col.zt}
									row={rIdx}
									col={cIdx}
									onLockOT={onLockOT}
									onUnlockOT={onUnlockOT}
									lockedValue={col.ot ? lockedKeys?.[col.ot.ch] : undefined}
									deception={Boolean(col.deception || col.ot == null)}
									onEditToken={onEditToken}
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
