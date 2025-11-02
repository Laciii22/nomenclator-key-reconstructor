import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import type { KeysPerOTMode } from '../components/types';
import KeyTable from '../components/table/KeyTable';
import { computeRowAlloc, computeFixedGroups, applyCapWithRedistribution, computeOTKeys } from '../utils/allocation';


const HomePage: React.FC = () => {
    const [otRaw, setOtRaw] = useState("");
    const [ztRaw, setZtRaw] = useState("");
    const [fixedPerOTEnabled, setFixedPerOTEnabled] = useState<boolean>(false);
    const [fixedPerOTSize, setFixedPerOTSize] = useState<number>(1);
    const [maxTokensCapEnabled, setMaxTokensCapEnabled] = useState<boolean>(false);
    const [maxTokensPerCell, setMaxTokensPerCell] = useState<number>(3);
    const [keysPerOTMode, setKeysPerOTMode] = useState<KeysPerOTMode>('multiple');
    const [lockedKeys, setLockedKeys] = useState<Record<string, string>>({});

    // Load persisted settings
    useEffect(() => {
        try {
            const raw = localStorage.getItem('nkr_settings');
            if (raw) {
                const s = JSON.parse(raw);
                if (typeof s.fixedPerOTEnabled === 'boolean') setFixedPerOTEnabled(s.fixedPerOTEnabled);
                if (typeof s.fixedPerOTSize === 'number' && s.fixedPerOTSize >= 1) setFixedPerOTSize(s.fixedPerOTSize);
                if (typeof s.maxTokensCapEnabled === 'boolean') setMaxTokensCapEnabled(s.maxTokensCapEnabled);
                if (typeof s.maxTokensPerCell === 'number' && s.maxTokensPerCell >= 1) setMaxTokensPerCell(s.maxTokensPerCell);
                if (s.keysPerOTMode === 'single' || s.keysPerOTMode === 'multiple') setKeysPerOTMode(s.keysPerOTMode);
                if (s.lockedKeys && typeof s.lockedKeys === 'object') setLockedKeys(s.lockedKeys as Record<string, string>);
            }
        } catch (e) {
            // ignore persistence read errors
            void e;
        }
    }, []);
    // Persist settings
    useEffect(() => {
        try {
            localStorage.setItem('nkr_settings', JSON.stringify({
                fixedPerOTEnabled,
                fixedPerOTSize,
                maxTokensCapEnabled,
                maxTokensPerCell,
                keysPerOTMode,
                lockedKeys,
            }));
        } catch (e) {
            // ignore persistence write errors
            void e;
        }
    }, [fixedPerOTEnabled, fixedPerOTSize, maxTokensCapEnabled, maxTokensPerCell, keysPerOTMode, lockedKeys]);

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
        // If there are spaces, split by whitespaces; otherwise split by characters.
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


    const [rowGroups, setRowGroups] = useState<number[][]>([]);


    // Apply a per-cell cap by clipping and redistributing leftovers round-robin

    useEffect(() => {
        if (fixedPerOTEnabled) {
            setRowGroups(computeFixedGroups(otRows, ztTokens, Math.max(1, Math.floor(fixedPerOTSize || 1))));
        } else {
            const { groups } = computeRowAlloc(otRows, ztTokens);
            if (maxTokensCapEnabled) {
                const cap = Math.max(1, Math.floor(maxTokensPerCell || 1));
                const { groups: capped } = applyCapWithRedistribution(groups, ztTokens.length, cap);
                setRowGroups(capped);
            } else {
                setRowGroups(groups);
            }
        }
    }, [otRows, ztTokens, fixedPerOTEnabled, fixedPerOTSize, maxTokensCapEnabled, maxTokensPerCell]);

    // Drag and drop handler for ZT tokens only
    function onMoveZTToken(tokenIndex: number, toRow: number, toCol: number) {
        // Instead of reordering tokens, redistribute counts between cells by modifying rowGroups
        if (!rowGroups[toRow]) return;
        const working = rowGroups.map(row => [...row]);

        // Find source cell of the token by walking cumulative counts
        let sourceRow = -1;
        let sourceCol = -1;
        let cursor = 0;
        outer: for (let r = 0; r < working.length; r++) {
            for (let c = 0; c < working[r].length; c++) {
                const cellCount = working[r][c] || 0;
                if (tokenIndex < cursor + cellCount) {
                    sourceRow = r;
                    sourceCol = c;
                    break outer;
                }
                cursor += cellCount;
            }
        }
        if (sourceRow < 0 || sourceCol < 0) return;

        // No-op if moving within the same cell
        if (sourceRow === toRow && sourceCol === toCol) return;

    // Respect minimum required tokens in source cell
    // - Always prevent removing the last token (min 1)
    // - If fixed-per-OT is enabled, enforce that fixed minimum size instead
    const minAllowed = fixedPerOTEnabled ? Math.max(1, Math.floor(fixedPerOTSize || 1)) : 1;
        if ((working[sourceRow][sourceCol] || 0) <= minAllowed) return;

        // Capacity checks for target cell
        const currentTarget = working[toRow][toCol] || 0;
        if (fixedPerOTEnabled) {
            const maxAllowed = Math.max(1, Math.floor(fixedPerOTSize || 1));
            if (currentTarget >= maxAllowed) return;
        } else if (maxTokensCapEnabled) {
            const cap = Math.max(1, Math.floor(maxTokensPerCell || 1));
            if (currentTarget >= cap) return;
        }

        // Build candidate with the move applied
        const candidate = working.map(row => [...row]);
        candidate[sourceRow][sourceCol] = Math.max(0, (candidate[sourceRow][sourceCol] || 0) - 1);
        if (!candidate[toRow][toCol]) candidate[toRow][toCol] = 0;
        candidate[toRow][toCol] += 1;

        // Enforce single-key mode and locks against the full map
        const otKeys = computeOTKeys(otRows, ztTokens, candidate);

        if (keysPerOTMode === 'single') {
            // Enforce single-key only for OTs that are locked; unlocked OTs can vary
            for (const [ot, set] of otKeys) {
                if (lockedKeys[ot]) {
                    if (set.size > 1) return; // locked OT cannot have multiple keys
                }
            }
        }
        // Enforce locks: if an OT is locked and present, it must match exactly that one key
        for (const [ot, lockedVal] of Object.entries(lockedKeys)) {
            const set = otKeys.get(ot);
            if (!set || set.size === 0) continue; // allow empty (no tokens for this OT yet)
            if (set.size !== 1 || Array.from(set)[0] !== lockedVal) return;
        }

        setRowGroups(candidate);
    }

    function onLockOT(ot: string, lockValue: string) {
        // TODO how it should be realiigned when locked? what if AHOJA is 12 3 4 51 2 locking A should realing it to 12 or lock for A 12 and also 2?
        setLockedKeys(prev => ({ ...prev, [ot]: lockValue }));
    }
    function onUnlockOT(ot: string) {
        setLockedKeys(prev => {
            const copy = { ...prev };
            delete copy[ot];
            return copy;
        });
    }

    // Apply constraints for rendering and key table
    const effectiveRowGroups = useMemo(() => {
        if (fixedPerOTEnabled) {
            const k = Math.max(1, Math.floor(fixedPerOTSize || 1));
            return rowGroups.map(row => row.map(g => Math.min(k, g)));
        }
        if (maxTokensCapEnabled) {
            const cap = Math.max(1, Math.floor(maxTokensPerCell || 1));
            return rowGroups.map(row => row.map(g => Math.min(cap, g)));
        }
        return rowGroups;
    }, [rowGroups, fixedPerOTEnabled, fixedPerOTSize, maxTokensCapEnabled, maxTokensPerCell]);

    // Global warnings for single-key violations and lock mismatches
    const singleKeyWarnings = useMemo(() => {
        const msgs: string[] = [];
        if (keysPerOTMode !== 'single') return msgs;
        const keyMap = computeOTKeys(otRows, ztTokens, effectiveRowGroups);
        // Only warn for OTs that are locked; unlocked OTs may have multiple keys
        for (const [ot, set] of keyMap) {
            if (lockedKeys[ot] && set.size > 1) {
                msgs.push(`„${ot}” má viac kľúčov (${Array.from(set).join(' ')})`);
            }
        }
        for (const [ot, lockedVal] of Object.entries(lockedKeys)) {
            const set = keyMap.get(ot);
            if (set && set.size > 0) {
                if (set.size !== 1 || Array.from(set)[0] !== lockedVal) {
                    msgs.push(`„${ot}” nezodpovedá zámku (${lockedVal})`);
                }
            }
        }
        return msgs;
    }, [keysPerOTMode, otRows, ztTokens, effectiveRowGroups, lockedKeys]);

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
                            <div className="flex items-center gap-3 text-sm">
                                <label className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={fixedPerOTEnabled}
                                        onChange={(e) => setFixedPerOTEnabled(e.target.checked)}
                                    />
                                    Fixná dĺžka ZT na OT (rovnaký počet tokenov v každej bunke)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    className="w-20 border border-gray-300 rounded p-1 text-sm disabled:bg-gray-100"
                                    value={fixedPerOTSize}
                                    onChange={(e) => setFixedPerOTSize(Number(e.target.value) || 1)}
                                    disabled={!fixedPerOTEnabled}
                                    title="Koľko ZT tokenov má mať každý OT znak"
                                />
                            </div>
                            {fixedPerOTEnabled && (
                                <div className="text-xs text-gray-600">
                                    Požadovaný počet ZT tokenov: {otChars.length * Math.max(1, Math.floor(fixedPerOTSize || 1))} • Aktuálne: {ztTokens.length}
                                    {ztTokens.length !== otChars.length * Math.max(1, Math.floor(fixedPerOTSize || 1)) && (
                                        <span className="text-amber-600"> (Upozornenie: počet ZT tokenov by mal byť násobkom dĺžky OT)</span>
                                    )}
                                </div>
                            )}
                            {!fixedPerOTEnabled && maxTokensCapEnabled && (
                                <div className="text-xs text-gray-600">
                                    Maximálna kapacita mriežky: {otChars.length * Math.max(1, Math.floor(maxTokensPerCell || 1))}
                                    {ztTokens.length > otChars.length * Math.max(1, Math.floor(maxTokensPerCell || 1)) && (
                                        <span className="text-amber-600"> (Upozornenie: v ZT je {ztTokens.length - otChars.length * Math.max(1, Math.floor(maxTokensPerCell || 1))} tokenov navyše, nevojdú sa)</span>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center gap-3 text-sm mt-2">
                                <label className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={maxTokensCapEnabled}
                                        onChange={(e) => setMaxTokensCapEnabled(e.target.checked)}
                                        disabled={fixedPerOTEnabled}
                                    />
                                    Maximálny počet ZT tokenov v bunke
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    className="w-24 border border-gray-300 rounded p-1 text-sm disabled:bg-gray-100"
                                    value={maxTokensPerCell}
                                    onChange={(e) => setMaxTokensPerCell(Number(e.target.value) || 1)}
                                    disabled={!maxTokensCapEnabled || fixedPerOTEnabled}
                                    title="Horný limit, koľko ZT tokenov môže byť v jednej bunke"
                                />
                            </div>
                            <div className="flex items-center gap-3 text-sm mt-2">
                                <label htmlFor="keysPerOT" className="whitespace-nowrap">Počet kľúčov na OT znak:</label>
                                <select
                                    id="keysPerOT"
                                    className="border border-gray-300 rounded p-1 text-sm"
                                    value={keysPerOTMode}
                                    onChange={(e) => setKeysPerOTMode(e.target.value as KeysPerOTMode)}
                                >
                                    <option value="single">Jeden kľúč na znak (A → 123)</option>
                                    <option value="multiple">Viac kľúčov na znak (A → 123, A → 111, …)</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600 mb-2">
                                OT znakov: {otChars.length} • ZT tokenov: {ztTokens.length}
                            </div>
                            {singleKeyWarnings.length > 0 && (
                                <div className="text-xs text-red-600 mb-2">
                                    Pozor: {singleKeyWarnings.join(' • ')}
                                </div>
                            )}
                            <MappingTable
                                otRows={otRows}
                                ztTokens={ztTokens}
                                rowGroups={effectiveRowGroups}
                                onMoveZTToken={onMoveZTToken}
                                onLockOT={onLockOT}
                                onUnlockOT={onUnlockOT}
                                lockedKeys={lockedKeys}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-base font-semibold">Tabuľka kľúčov</h3>
                        <KeyTable
                            otRows={otRows}
                            ztTokens={ztTokens}
                            rowGroups={effectiveRowGroups}
                            keysPerOTMode={keysPerOTMode}
                            lockedKeys={lockedKeys}
                            onLockOT={onLockOT}
                            onUnlockOT={onUnlockOT}
                        />
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default HomePage;