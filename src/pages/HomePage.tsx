import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import type { OTChar, ZTToken } from '../components/types';
import KeyTable from '../components/table/KeyTable';

const HomePage: React.FC = () => {
    const [otRaw, setOtRaw] = useState("");
    const [ztRaw, setZtRaw] = useState("");

    // TODO this will go to a utility file
    async function readTextFile(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.readAsText(file, "utf-8");
        });
    }

    const otChars = useMemo(() => {
        // All non-whitespace characters are considered OT symbols
        const chars = Array.from(otRaw).filter(ch => !/\s/.test(ch));
        return chars.map((ch, i) => ({ id: `ot_${i}`, ch }));
    }, [otRaw]);

    const ztTokens = useMemo(() => {
        // If there are spaces, split by whitespaces, otherwise calculete by yourself
        const s = ztRaw.trim();
        const parts = /\s/.test(s) ? s.split(/\s+/).filter(Boolean) : Array.from(s);
        return parts.map((t, i) => ({ id: `zt_${i}`, text: t }));
    }, [ztRaw]);

    const COLS = 12; // default number of columns for OT display //TODO make it more this is not big enouggh
    const otRows = useMemo(() => {
        const rows: { id: string; ch: string }[][] = [];
        for (let i = 0; i < otChars.length; i += COLS) {
            rows.push(otChars.slice(i, i + COLS));
        }
        return rows.length ? rows : [[]];
    }, [otChars]);

    // Compute initial proportional allocation of ZT tokens to rows and cells
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
                if (newGroups[sourceRow][sourceCol] <= 1) {
                    return; // Prevent removing the last token from a cell
                }
                newGroups[sourceRow][sourceCol]--;
            }

            // Add one token to target cell
            if (!newGroups[toRow][toCol]) {
                newGroups[toRow][toCol] = 0;
            }
            newGroups[toRow][toCol]++;


            setRowGroups(newGroups);
        }
    }

    return (
        <AppLayout>
            <div className="container mx-auto px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="space-y-4 lg:col-span-2">
                        <label className="block text-sm font-medium">OT (napr. AHOJ):</label>
                        <input
                            type="file"
                            accept=".txt"
                            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 mb-2"
                            onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                    try {
                                        const text = await readTextFile(f);
                                        setOtRaw(text);
                                    } catch {
                                        // ignore read errors for now
                                    }
                                }
                                // allow re-selecting the same file later
                                e.currentTarget.value = "";
                            }}
                        />
                        <textarea
                            rows={3}
                            className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Sem napíš OT text"
                            value={otRaw}
                            onChange={(e) => setOtRaw(e.target.value)}
                        />
                        <div className="space-y-2">
                            <label className="block text-sm font-medium">ZT (napr. 12345678):</label>
                            <input
                                type="file"
                                accept=".txt"
                                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 mb-2"
                                onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                        try {
                                            const text = await readTextFile(f);
                                            setZtRaw(text);
                                        } catch {
                                            // ignore read errors for now
                                        }
                                    }
                                    e.currentTarget.value = "";
                                }}
                            />
                            <textarea
                                rows={3}
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