
import React from 'react';
import { DndContext, useSensors, useSensor, MouseSensor, TouchSensor, KeyboardSensor, pointerWithin } from '@dnd-kit/core';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import BracketEditor from '../components/controls/BracketEditor';
import ParseControls from '../components/controls/ParseControls';
import CandidateSelectorFixed from '../components/controls/CandidateSelectorFixed';
import CandidateSelectorSeparator from '../components/controls/CandidateSelectorSeparator';
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
    chooseScoreOneSuggestions,
    editZtToken,
    insertRawCharsAfterPosition,
    splitOTAt,
    // highlighting
    highlightedOTChar,
    toggleHighlightForOT,
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
        <h1 className="text-xl font-semibold mb-4">Nomenclator</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-4 lg:col-span-2">
            <label className="block text-sm font-medium">OT (e.g. HELLO):</label>
            <textarea
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Here write OT text (characters only)"

              value={otRaw}
              onChange={(e) => setOtRaw(e.target.value)}
            />

            <label className="block text-sm font-medium">ZT (e.g. 11 34 12 12 56):</label>
            <textarea
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Here write ZT text (spaces = tokens; no spaces = by characters)"
              value={ztRaw}
              onChange={(e) => setZtRaw(e.target.value)}
            />

            {statusMessage && (
              <div
                className={`text-sm rounded p-2 mt-2 border ${
                  klamacStatus === 'invalid'
                    ? 'text-red-700 bg-red-50 border-red-300'
                    : klamacStatus === 'needsKlamac'
                      ? 'text-red-700 bg-red-50 border-red-300'
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
                  <h3 className="font-semibold">Suggestions</h3>
                  <div className="flex gap-2">
                      {/* Removed showAllCandidates checkbox and logic */}
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => {
                          setSelections({});
                          setLockedKeys({});
                          // Reset selections and locks only; columns derive automatically now.
                        }}
                        title="Clear all locks and selections"
                      >
                        Clear all
                      </button>

                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={() => { chooseScoreOneSuggestions(); }}
                      >Preview selection</button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={applySelection}
                    >Apply selection</button>
                  </div>
                </div>
                {selectionError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {selectionError}
                  </div>
                )}
                
                {ztParseMode === 'fixedLength' ? (
                  <CandidateSelectorFixed
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys}
                    selections={selections}
                    setSelections={setSelections}
                    otRows={otRows}
                    effectiveZtTokens={effectiveZtTokens}
                    fixedLength={fixedLength}
                    reservedTokens={reservedTokens}
                    sharedColumns={sharedColumns}
                  />
                ) : (
                  <CandidateSelectorSeparator
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys}
                    selections={selections}
                    setSelections={setSelections}
                    otRows={otRows}
                    effectiveZtTokens={effectiveZtTokens}
                    reservedTokens={reservedTokens}
                    sharedColumns={sharedColumns}
                  />
                )}
              </div>
            )}

          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold">Key Table</h3>
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
              highlightedOTChar={highlightedOTChar}
              onToggleHighlightOT={toggleHighlightForOT}
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
                OT characters: {otChars.length} • ZT tokens: {ztParseMode === 'fixedLength' ? Math.floor(ztTokens.length / Math.max(1, fixedLength)) : ztTokens.length}
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
                onInsertRawCharsAfterPosition={(pos, text, replace) => insertRawCharsAfterPosition(pos, text, replace)}
                onSplitGroup={(fi: number) => splitOTAt(fi)}
                canInsertRaw={ztParseMode === 'fixedLength'}
                canSplitGroup={true}
                highlightedOTChar={highlightedOTChar}
              />
            </div>
      </div>
      </DndContext>
    </AppLayout>
  );
};

export default NomenklatorPage;
