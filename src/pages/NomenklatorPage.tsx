
import React from 'react';
import { DndContext } from '@dnd-kit/core';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import BracketEditor from '../components/controls/BracketEditor';
import ParseControls from '../components/controls/ParseControls';
import { computeRowAlloc } from '../utils/allocation';
import { convertCountsToLists } from '../utils/grouping';
import { useNomenklator } from '../hooks/useNomenklator';
import type { SelectionMap } from '../utils/analyzer';

const NomenklatorPage: React.FC = () => {
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
    otRows, baselineGroups,
  displayRowGroups,
    uniqueZTTokenTexts, reservedTokens,
    // actions
    runAnalysis,
    onLockOT, onUnlockOT,
    onDragEnd,
    toggleBracketGroupByText,
    previewSelection,
    applySelection,
    editZtToken,
  setDisplayRowGroups, setAnalysisRowGroups,
  } = useNomenklator();
  

  return (
    <AppLayout>
      <DndContext onDragEnd={onDragEnd}>
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
                          setAnalysisRowGroups(convertCountsToLists(baselineGroups));
                          const { groups: effGroups } = computeRowAlloc(otRows, effectiveZtTokens);
                          setDisplayRowGroups(convertCountsToLists(effGroups));
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
                          {extendedList.filter(c => c.length === 1).map((c, idx) => {
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
                            const occMap: Record<string, number[]> = {};
                            effectiveZtTokens.forEach((t, i) => { (occMap[t.text] ||= []).push(i); });
                            const occ = occMap[c.token] || [];
                            let orderInvalid = false;
                            if (cellFlatIndex === 0) {
                              const firstOcc = occ.length ? occ[0] : -1;
                              orderInvalid = firstOcc !== 0;
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
                                      ? 'Token by preskočil prvý pôvodný token – nie je povolený pre prvý znak'
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

            

            <div>
              <div className="text-sm text-gray-600 mb-2">
                OT znakov: {otChars.length} • ZT tokenov: {ztTokens.length}
              </div>
              
              <MappingTable
                otRows={otRows}
                ztTokens={effectiveZtTokens}
                rowGroups={displayRowGroups}
                onLockOT={onLockOT}
                onUnlockOT={onUnlockOT}
                lockedKeys={lockedKeys}
                hasDeceptionWarning={klamacStatus === 'needsKlamac'}
                onEditToken={editZtToken}
                selections={selections}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold">Tabuľka kľúčov</h3>
            <KeyTable
              otRows={otRows}
              ztTokens={effectiveZtTokens}
              rowGroups={displayRowGroups.length > 0 ? displayRowGroups : convertCountsToLists(baselineGroups)}
              keysPerOTMode={keysPerOTMode}
              lockedKeys={lockedKeys}
              onLockOT={onLockOT}
              onUnlockOT={onUnlockOT}
              onLockAll={(locks) => {
                // Bulk lock: update lockedKeys AND selections so dropdowns reflect zámky.
                setLockedKeys(prev => ({ ...prev, ...locks }));
                setSelections(prev => {
                  const next = { ...prev } as SelectionMap;
                  for (const [ch, val] of Object.entries(locks)) {
                    if (val && next[ch] == null) next[ch] = val; // zapíš len ak nie je vyplnené
                  }
                  return next;
                });
                // Prepočítaj analýzu až po nastavení stavov (microtask)
                queueMicrotask(() => runAnalysis());
              }}
            />
          </div>
        </div>
      </div>
      </DndContext>
    </AppLayout>
  );
};

export default NomenklatorPage;
