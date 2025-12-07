
import React from 'react';
import { DndContext, useSensors, useSensor, MouseSensor, TouchSensor, KeyboardSensor, pointerWithin } from '@dnd-kit/core';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import BracketEditor from '../components/controls/BracketEditor';
import ParseControls from '../components/controls/ParseControls';
import { useNomenklator } from '../hooks/useNomenklator';
import type { SelectionMap } from '../utils/analyzer';
import { buildShiftOnlyColumns } from '../utils/shiftMapping';

const NomenklatorPage: React.FC = () => {

    //const TEST_OT = 'ahaho pisal stare znaky do knihy potichu.';
    //const TEST_ZT = '1:6:99:1:6:12:13:7:15:1:10:15:16:99:1:14:5:19:11:1:9:18:4:12:9:11:7:6:18:99:13:12:16:7:3:6:17:20';

  const {
    // inputs
    otRaw, setOtRaw,
    ztRaw, setZtRaw,
    ztParseMode, setZtParseMode,
    separator, setSeparator,
    fixedLength, setFixedLength,
    keysPerOTMode, setKeysPerOTMode,
    // state
    lockedKeys, setLockedKeys,
    selections, setSelections,
    candidatesByChar,
    klamacStatus, statusMessage,
  setBracketedIndices,
    bracketWarning,
    analysisDone,
    selectionError,
    // derived
    otChars, ztTokens, effectiveZtTokens,
    otRows,
    uniqueZTTokenTexts, reservedTokens,
    // actions
    runAnalysis,
    onLockOT, onUnlockOT,
    onDragStart,
    onDragEnd,
    
    toggleBracketGroupByText,
    previewSelection,
    applySelection,
    editZtToken,
    insertRawCharsAfterPosition,
    splitOTAt,
  } = useNomenklator();
  
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Shared columns grid: same builder for both tables
  const sharedColumns = React.useMemo(() => buildShiftOnlyColumns(otRows, effectiveZtTokens, lockedKeys, selections, ztParseMode === 'fixedLength' ? fixedLength : 1), [otRows, effectiveZtTokens, lockedKeys, selections, ztParseMode, fixedLength]);

  return (
    <AppLayout>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-4">Nomenklátor – automatické návrhy</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-4 lg:col-span-2">
            <label className="block text-sm font-medium">OT (napr. AHOJ):</label>
            <textarea
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sem napíš OT text"
              value={otRaw}
              onChange={(e) => setOtRaw(e.target.value)}
            />

            <label className="block text-sm font-medium">ZT (napr. 12 34 12 56):</label>
            <textarea
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sem napíš ZT text (medzery = tokeny; bez medzier = po znakoch)"
              value={ztRaw}
              onChange={(e) => setZtRaw(e.target.value)}
            />

            {statusMessage && (
              <div
                className={`text-sm rounded p-2 mt-2 border ${
                  klamacStatus === 'invalid'
                    ? 'text-red-700 bg-red-50 border-red-300'
                    : klamacStatus === 'needsKlamac'
                      ? 'text-orange-700 bg-orange-50 border-orange-300'
                      : 'text-green-700 bg-green-50 border-green-300'
                }`}
              >
                {statusMessage}
              </div>
            )}

            <BracketEditor
              ztTokens={ztTokens}
              analysisDone={analysisDone}
              bracketWarning={bracketWarning}
              uniqueZTTokenTexts={uniqueZTTokenTexts}
              onToggleText={toggleBracketGroupByText}
              onClear={() => setBracketedIndices([])}
            />

            <ParseControls
              ztParseMode={ztParseMode}
              onChangeMode={setZtParseMode}
              separator={separator}
              onSeparatorChange={setSeparator}
              fixedLength={fixedLength}
              onFixedLengthChange={(v) => setFixedLength(Math.max(1, v))}
              keysPerOTMode={keysPerOTMode}
              onKeysPerOTModeChange={setKeysPerOTMode}
              canRunAnalysis={!(otChars.length === 0 || ztTokens.length === 0)}
              onRunAnalysis={runAnalysis}
            />

            {Object.keys(candidatesByChar).length > 0 && (
              <div className="border border-gray-200 rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Návrhy</h3>
                  <div className="flex gap-2">
                      {/* Removed showAllCandidates checkbox and logic */}
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => {
                          setSelections({});
                          setLockedKeys({});
                          // Reset selections and locks only; columns derive automatically now.
                        }}
                        title="Vymazať všetky zámky a výbery"
                      >
                        Vymazať
                      </button>
                      
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={previewSelection}
                      >Náhľad výberu</button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={applySelection}
                    >Aplikovať výber</button>
                  </div>
                </div>
                {selectionError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {selectionError}
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(candidatesByChar).sort((a,b)=> a[0].localeCompare(b[0])).map(([ch, list]) => {
                    const lockedVal = lockedKeys[ch];
                    const selectionVal = selections[ch];
                    // Hodnota selectu: preferuj explicitný výber, inak locked
                    const currentValue = selectionVal ?? lockedVal ?? '';
                    const disabledSelect = Boolean(lockedVal); // ak je zamknuté, nedovoľ meniť
                    // Ak locked hodnota nie je v kandidátoch (edge case po zmene parsovania), vlož ju na začiatok
                    const extendedList = [...list];
                    if (lockedVal && !extendedList.some(c => c.token === lockedVal)) {
                      extendedList.unshift({ token: lockedVal, length: 1, support: 0, occurrences: 0, score: 1 });
                    }
                    const sortedByScore = extendedList.sort((a,b)=> {
                      if (b.score !== a.score) return b.score - a.score;
                      return a.token.localeCompare(b.token);
                    });
                    return (
                      <div key={ch} className="flex items-center gap-3">
                        <div className="w-10 font-mono text-center">
                          <span className="inline-block px-2 py-0.5 rounded bg-gray-100 border border-gray-200" title={lockedVal ? `Zamknuté: ${lockedVal}` : undefined}>{ch}</span>
                        </div>
                        <select
                          className={`border border-gray-300 rounded p-1 text-sm flex-1 ${disabledSelect ? 'bg-green-50 cursor-not-allowed' : ''}`}
                          value={currentValue}
                          disabled={disabledSelect}
                          onChange={(e) => {
                            const val = e.target.value || '';
                            setSelections(prev => ({ ...prev, [ch]: val === '' ? null : val }));
                          }}
                        >
                          <option value="">Žiadne (nezamknúť)</option>
                          {sortedByScore.filter(c => c.length === 1).map((c, idx) => {
                            const takenByOther = reservedTokens.has(c.token) && selectionVal !== c.token && lockedVal !== c.token;
                            const cellFlatIndex = (() => {
                              let idx2 = 0;
                              for (const row of otRows) {
                                for (const cell of row) {
                                  if (cell.ch !== '') {
                                    if (cell.ch === ch) return idx2;
                                    idx2++;
                                  }
                                }
                              }
                              return -1;
                            })();
                            const groupSize = ztParseMode === 'fixedLength' ? fixedLength : 1;
                            const occMap: Record<string, number[]> = {};
                            if (groupSize === 1) {
                              effectiveZtTokens.forEach((t, i) => { (occMap[t.text] ||= []).push(i); });
                            } else {
                              for (let i = 0; i + groupSize - 1 < effectiveZtTokens.length; i += groupSize) {
                                const grp = effectiveZtTokens.slice(i, i + groupSize).map(x => x.text).join('');
                                (occMap[grp] ||= []).push(i);
                              }
                            }
                            const occ = occMap[c.token] || [];
                            // Sekvenčné poradie pre fixedLength: pozícia i by mala začínať na indexe i*groupSize
                            // Uvoľníme to tak, že ak je pred OT bunkou N raw tokenov v klamačoch,
                            // akceptujeme štarty v intervale expectedStart ± N.
                            let orderInvalid = false;
                            if (ztParseMode === 'fixedLength' && cellFlatIndex >= 0) {
                              const expectedStart = cellFlatIndex * groupSize;
                              // Build flatColumns from sharedColumns to count deception tokens before the target OT cell
                              const flatColumns: { otCh: string | null; indices: number[] }[] = [];
                              for (const row of sharedColumns) for (const col of row) flatColumns.push({ otCh: col.ot ? col.ot.ch : null, indices: col.zt });
                              // Count how many raw tokens are represented by deception cells overall
                              let deceptionTotal = 0;
                              for (let i = 0; i < flatColumns.length; i++) if (flatColumns[i].otCh == null) deceptionTotal += (flatColumns[i].indices || []).length;
                              // Accept token if any of its start occurrences is within expectedStart ± deceptionTotal
                              orderInvalid = !occ.some(i => Math.abs(i - expectedStart) <= deceptionTotal);
                            } else if (cellFlatIndex >= 0) {
                              // Separator mode (one token per OT): expectedStart = cellFlatIndex
                              // Allow selection if token occurs within ± total deception token count
                              const expectedStart = cellFlatIndex;
                              const flatColumns: { otCh: string | null; indices: number[] }[] = [];
                              for (const row of sharedColumns) for (const col of row) flatColumns.push({ otCh: col.ot ? col.ot.ch : null, indices: col.zt });
                              let deceptionTotal = 0;
                              for (let i = 0; i < flatColumns.length; i++) if (flatColumns[i].otCh == null) deceptionTotal += (flatColumns[i].indices || []).length;
                              orderInvalid = !occ.some(i => Math.abs(i - expectedStart) <= deceptionTotal);
                            }
                            const disabled = takenByOther || orderInvalid;
                            const scoreStr = ` (score: ${c.score.toFixed(2)})`;
                            return (
                              <option
                                key={idx}
                                value={c.token}
                                disabled={disabled}
                                title={
                                  takenByOther
                                    ? 'Tento token je už použitý pre iný znak'
                                    : orderInvalid
                                      ? (ztParseMode === 'fixedLength'
                                          ? `Token musí začínať na indexe ${cellFlatIndex * groupSize} pre pozíciu ${cellFlatIndex}`
                                          : 'Token musí začínať na indexe 0 pre prvý OT znak')
                                      : undefined
                                }
                              >
                                {c.token}{scoreStr}{lockedVal === c.token ? ' (locked)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {lockedVal && (
                          <span className="text-xs text-green-700">locked: {lockedVal}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold">Tabuľka kľúčov</h3>
            <KeyTable
              otRows={otRows}
              ztTokens={effectiveZtTokens}
              keysPerOTMode={keysPerOTMode}
              lockedKeys={lockedKeys}
              selections={selections}
              onLockOT={onLockOT}
              onUnlockOT={onUnlockOT}
              ztParseMode={ztParseMode}
              groupSize={ztParseMode==='fixedLength'? fixedLength : 1}
              columns={sharedColumns}
              onLockAll={(locks) => {
                setLockedKeys(prev => ({ ...prev, ...locks }));
                setSelections(prev => {
                  const next = { ...prev } as SelectionMap;
                  for (const [ch, val] of Object.entries(locks)) if (val && next[ch] == null) next[ch] = val;
                  return next;
                });
                queueMicrotask(() => runAnalysis());
              }}
            />
          </div>
        </div>

                    <div>
              <div className="text-sm text-gray-600 mb-2">
                OT znakov: {otChars.length} • ZT tokenov: {ztParseMode === 'fixedLength' ? Math.floor(ztTokens.length / Math.max(1, fixedLength)) : ztTokens.length}
              </div>
              
              <MappingTable
                otRows={otRows}
                ztTokens={effectiveZtTokens}
                onLockOT={onLockOT}
                onUnlockOT={onUnlockOT}
                lockedKeys={lockedKeys}
                hasDeceptionWarning={klamacStatus === 'needsKlamac'}
                onEditToken={editZtToken}
                selections={selections}
                groupSize={ztParseMode === 'fixedLength' ? fixedLength : 1}
                onInsertRawCharsAfterPosition={(pos, text) => insertRawCharsAfterPosition(pos, text)}
                onSplitGroup={(fi: number) => splitOTAt(fi)}
                canInsertRaw={ztParseMode === 'fixedLength'}
                canSplitGroup={true}
              />
            </div>
      </div>
      </DndContext>
    </AppLayout>
  );
};

export default NomenklatorPage;
