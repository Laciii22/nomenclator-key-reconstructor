import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';

const HomePage: React.FC = () => {
        const [otRaw, setOtRaw] = useState("");
        const [ztRaw, setZtRaw] = useState("");

        const otChars = useMemo(() => {
            // ber všetky ne-whitespace znaky ako OT symboly
            const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
            return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
        }, [otRaw]);

        const ztTokens = useMemo(() => {
            // ak sú medzery, rozdeľ podľa whitespace; inak po jednotlivých znakoch
            const s = ztRaw.trim();
            const parts = /\s/.test(s) ? s.split(/\s+/).filter(Boolean) : Array.from(s);
            return parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
        }, [ztRaw]);

            const COLS = 20; // default počet stĺpcov na riadok
            const otRows = useMemo(() => {
                const rows: { id: string; ch: string }[][] = [];
                for (let i = 0; i < otChars.length; i += COLS) {
                    rows.push(otChars.slice(i, i + COLS));
                }
                return rows.length ? rows : [[]];
            }, [otChars]);

                // Compute initial proportional allocation of ZT tokens to rows and cells
                type OTChar = { id: string; ch: string };
                type ZTToken = { id: string; text: string };

                function computeRowAlloc(rows: OTChar[][], tokens: ZTToken[]) {
                    const totalOT = rows.reduce((acc, r) => acc + r.filter(c => c.ch !== '').length, 0);
                    const totalZT = tokens.length;
                    if (totalOT === 0) return { rowAlloc: rows.map(() => 0), groups: rows.map(() => [] as number[]) };
                    const ratio = totalZT / totalOT;
                    const info = rows.map(r => ({ otCount: r.filter(c => c.ch !== '').length, frac: 0, alloc: 0 }));
                    let allocated = 0;
                    for (const inf of info) {
                        const exact = inf.otCount * ratio;
                        const base = Math.floor(exact);
                        inf.alloc = base;
                        inf.frac = exact - base;
                        allocated += base;
                    }
                    let remaining = totalZT - allocated;
                    if (remaining > 0) {
                        const order = info.map((x, i) => ({ i, frac: x.frac })).sort((a, b) => b.frac - a.frac);
                        let j = 0;
                        while (remaining > 0 && order.length > 0) {
                            info[order[j].i].alloc += 1;
                            remaining--;
                            j = (j + 1) % order.length;
                        }
                    }
                    const rowAlloc = info.map(x => x.alloc);
                    // per-row distribution into cell group sizes (as even as possible)
                    const groups = rows.map((r, idx) => {
                        const otCells = r.filter(c => c.ch !== '');
                        const oc = otCells.length;
                        if (oc === 0) return [] as number[];
                        const count = rowAlloc[idx];
                        const base = Math.floor(count / oc);
                        let rem = count % oc;
                        const arr: number[] = [];
                        for (let k = 0; k < oc; k++) {
                            const g = base + (rem > 0 ? 1 : 0);
                            if (rem > 0) rem--;
                            arr.push(g);
                        }
                        return arr;
                    });
                    return { rowAlloc, groups };
                }

                const [rowGroups, setRowGroups] = useState<number[][]>([]);

                useEffect(() => {
                    const { groups } = computeRowAlloc(otRows, ztTokens);
                    setRowGroups(groups);
                }, [otRows, ztTokens]);

    // Drag and drop handler for ZT tokens only
    function onMoveZTToken(tokenIndex: number, toRow: number, toCol: number) {
        console.log(`Move ZT token ${tokenIndex} to cell [${toRow},${toCol}]`);
        
        // Instead of reordering tokens, we redistribute them between cells
        // by modifying the rowGroups allocation
        
        if (!rowGroups[toRow]) return;
        
        const newGroups = rowGroups.map(row => [...row]);
        
        // Find source cell of the token
        let sourceRow = -1;
        let sourceCol = -1;
        let tokenCount = 0;
        
        for (let r = 0; r < newGroups.length; r++) {
            for (let c = 0; c < newGroups[r].length; c++) {
                if (tokenCount + newGroups[r][c] > tokenIndex) {
                    sourceRow = r;
                    sourceCol = c;
                    break;
                }
                tokenCount += newGroups[r][c];
            }
            if (sourceRow >= 0) break;
        }
        
        if (sourceRow >= 0 && sourceCol >= 0) {
            // Remove one token from source cell
            if (newGroups[sourceRow][sourceCol] > 0) {
                newGroups[sourceRow][sourceCol]--;
            }
            
            // Add one token to target cell
            if (!newGroups[toRow][toCol]) {
                newGroups[toRow][toCol] = 0;
            }
            newGroups[toRow][toCol]++;
            
            console.log(`Moved token from [${sourceRow},${sourceCol}] to [${toRow},${toCol}]`);
            console.log('New groups:', newGroups);
            
            setRowGroups(newGroups);
        }
    }

        return (
            <AppLayout>
                <div className="container mx-auto px-4 py-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <label className="block text-sm font-medium">OT (napr. AHOJ):</label>
                            <textarea
                                rows={8}
                                className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Sem napíš OT text"
                                value={otRaw}
                                onChange={(e) => setOtRaw(e.target.value)}
                            />
                            <div className="space-y-2">
                                <label className="block text-sm font-medium">ZT (napr. 12345678):</label>
                                <textarea
                                    rows={8}
                                    className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Sem napíš ZT text (medzery = tokeny; bez medzier = po znakoch)"
                                    value={ztRaw}
                                    onChange={(e) => setZtRaw(e.target.value)}
                                />
                            </div>
                            <div>
                                                <div className="text-sm text-gray-600 mb-2">
                                    OT znakov: {otChars.length} • ZT tokenov: {ztTokens.length}
                                </div>
                                                <MappingTable
                                                    otRows={otRows}
                                                    ztTokens={ztTokens}
                                                    rowGroups={rowGroups}
                                                    onMoveZTToken={onMoveZTToken}
                                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-base font-semibold">Tabuľka kľúčov</h3>
                                            <KeyTable otRows={otRows} ztTokens={ztTokens} rowGroups={rowGroups} />
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
};

export default HomePage;