import React from 'react';
import type { Active, DragStartEvent, DragEndEvent, DragCancelEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, useSensors, useSensor, MouseSensor, TouchSensor, KeyboardSensor, pointerWithin, MeasuringStrategy } from '@dnd-kit/core';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import BracketEditor from '../components/controls/BracketEditor';
import ParseControls from '../components/controls/ParseControls';
import CandidateSelectorFixed from '../components/controls/CandidateSelectorFixed';
import CandidateSelectorSeparator from '../components/controls/CandidateSelectorSeparator';
import CandidateSelectorMulti from '../components/controls/CandidateSelectorMulti';
import HelpModal from '../components/common/HelpModal';
import FileImport from '../components/controls/FileImport';
import { useNomenklator } from '../hooks/useNomenklator';
import type { SelectionMap } from '../utils/analyzer';

/**
 * Main interactive page for reconstructing a nomenclator key from OT (plain text)
 * and ZT (cipher text tokens).
 *
 * The UI is intentionally split into three vertical concerns:
 * - Inputs + parsing controls
 * - Suggestions/selection helpers
 * - Mapping + key tables
 */
const NomenklatorPage: React.FC = () => {

  const { inputs, state, derived, actions } = useNomenklator();
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);

  const {
    otRaw,
    setOtRaw,
    ztRaw,
    setZtRaw,
    ztParseMode,
    setZtParseMode,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    keysPerOTMode,
    setKeysPerOTMode,
  } = inputs;

  const {
    lockedKeys,
    setLockedKeys,
    selections,
    setSelections,
    candidatesByChar,
    klamacStatus,
    statusMessage,
    setBracketedIndices,
    bracketWarning,
    analysisDone,
    isAnalyzing,
    selectionError,
    mergeAllPrompt,
    highlightedOTChar,
  } = state;

  const {
    otChars,
    ztTokens,
    effectiveZtTokens,
    otRows,
    columns,
    uniqueZTTokenTexts,
    reservedTokens,
    shiftMeta,
  } = derived;

  const {
    runAnalysis,
    onLockOT,
    onUnlockOT,
    onDragStart,
    onDragEnd,
    onDragCancel,
    toggleBracketGroupByText,
    chooseScoreOneSuggestions,
    applySelection,
    editZtToken,
    insertRawCharsAfterPosition,
    splitOTAt,
    shiftGroupRight,
    shiftGroupLeft,
    mergeAllOccurrences,
    dismissMergeAllPrompt,
    toggleHighlightForOT,
    quickAssign,
    executeQuickAssign,
  } = actions;

  const otTextareaId = 'ot-raw';
  const ztTextareaId = 'zt-raw';

  const onOtChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setOtRaw(e.target.value.toUpperCase());
  }, [setOtRaw]);

  const onZtChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setZtRaw(e.target.value);
  }, [setZtRaw]);

  const onOtFileLoad = React.useCallback((content: string) => {
    setOtRaw(content.toUpperCase());
  }, [setOtRaw]);

  const onZtFileLoad = React.useCallback((content: string) => {
    setZtRaw(content);
  }, [setZtRaw]);

  const onFixedLengthChange = React.useCallback((v: number) => {
    setFixedLength(Math.max(1, v));
  }, [setFixedLength]);

  const onClearAll = React.useCallback(() => {
    setSelections({});
    setLockedKeys({});
  }, [setLockedKeys, setSelections]);

  const onPreviewSelection = React.useCallback(() => {
    chooseScoreOneSuggestions();
  }, [chooseScoreOneSuggestions]);

  const onApplySelection = React.useCallback(() => {
    applySelection();
  }, [applySelection]);

  const onLockAll = React.useCallback((locks: Record<string, string | string[]>) => {
    setLockedKeys(prev => ({ ...prev, ...locks }));
    setSelections(prev => {
      const next = { ...prev } as SelectionMap;
      for (const [ch, val] of Object.entries(locks)) {
        if (val && next[ch] == null) {
          next[ch] = val;
        }
      }
      return next;
    });
    queueMicrotask(() => runAnalysis());
  }, [runAnalysis, setLockedKeys, setSelections]);

  const onInsertRawCharsAfterPosition = React.useCallback((pos: number, text: string, replace?: boolean) => {
    insertRawCharsAfterPosition(pos, text, replace);
  }, [insertRawCharsAfterPosition]);

  const onSplitGroup = React.useCallback((fi: number) => {
    splitOTAt(fi);
  }, [splitOTAt]);

  const [activeDrag, setActiveDrag] = React.useState<Active | null>(null);

  const activeDragInfo = React.useMemo(() => {
    const data = (activeDrag?.data?.current ?? {}) as any;
    const type = data?.type === 'zt' || data?.type === 'ot' ? (data.type as 'zt' | 'ot') : undefined;
    return {
      type,
      otSourceRow: typeof data?.sourceRow === 'number' ? (data.sourceRow as number) : undefined,
      otSourceCol: typeof data?.sourceCol === 'number' ? (data.sourceCol as number) : undefined,
      ztTokenIndex: typeof data?.tokenIndex === 'number' ? (data.tokenIndex as number) : null,
    };
  }, [activeDrag]);

  const handleDragStart = React.useCallback((evt: DragStartEvent) => {
    setActiveDrag(evt.active);
    onDragStart();
  }, [onDragStart]);

  const clearDragState = React.useCallback(() => {
    setActiveDrag(null);
  }, []);

  const handleDragEnd = React.useCallback((evt: DragEndEvent) => {
    onDragEnd(evt);
    clearDragState();
  }, [clearDragState, onDragEnd]);

  const handleDragCancel = React.useCallback((_evt: DragCancelEvent) => {
    onDragCancel();
    clearDragState();
  }, [clearDragState, onDragCancel]);
  
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  return (
    <AppLayout onHelpClick={() => setIsHelpOpen(true)}>
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <DndContext
        sensors={sensors}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.WhileDragging,
          },
        }}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-4">Nomenclator</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium" htmlFor={otTextareaId}>OT (e.g. HELLO):</label>
              <FileImport label="Import OT" onFileLoad={onOtFileLoad} />
            </div>
            <textarea
              id={otTextareaId}
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Here write OT text (characters only)"
              value={otRaw}
              onChange={onOtChange}
            />

            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium" htmlFor={ztTextareaId}>ZT (e.g. 11 34 12 12 56):</label>
              <FileImport label="Import ZT" onFileLoad={onZtFileLoad} />
            </div>
            <textarea
              id={ztTextareaId}
              rows={3}
              className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Here write ZT text (spaces = tokens; no spaces = by characters)"
              value={ztRaw}
              onChange={onZtChange}
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
              onFixedLengthChange={onFixedLengthChange}
              keysPerOTMode={keysPerOTMode}
              onKeysPerOTModeChange={setKeysPerOTMode}
              canRunAnalysis={!(otChars.length === 0 || ztTokens.length === 0)}
              onRunAnalysis={runAnalysis}
              isAnalyzing={isAnalyzing}
            />

            {Object.keys(candidatesByChar).length > 0 && (
              <div className="border border-gray-200 rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Suggestions</h3>
                  <div className="flex gap-2">
                      {/* Removed showAllCandidates checkbox and logic */}
                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={onClearAll}
                        title="Clear all locks and selections"
                      >
                        Clear all
                      </button>

                      <button
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        onClick={onPreviewSelection}
                      >Preview selection</button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={onApplySelection}
                    >Apply selection</button>
                  </div>
                </div>
                {selectionError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {selectionError}
                  </div>
                )}
                
                <div className="text-xs text-gray-500 mb-2">
                  Mode: {keysPerOTMode === 'multiple' ? 'Multi-key (homophones)' : 'Single-key'}
                </div>
                
                {keysPerOTMode === 'multiple' ? (
                  <CandidateSelectorMulti
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys}
                    selections={selections}
                    setSelections={setSelections}
                    otRows={otRows}
                    effectiveZtTokens={effectiveZtTokens}
                    reservedTokens={reservedTokens}
                    sharedColumns={columns}
                  />
                ) : ztParseMode === 'fixedLength' ? (
                  <CandidateSelectorFixed
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys as Record<string, string>}
                    selections={selections}
                    setSelections={setSelections}
                    otRows={otRows}
                    effectiveZtTokens={effectiveZtTokens}
                    fixedLength={fixedLength}
                    reservedTokens={reservedTokens}
                    sharedColumns={columns}
                  />
                ) : (
                  <CandidateSelectorSeparator
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys as Record<string, string>}
                    selections={selections}
                    setSelections={setSelections}
                    otRows={otRows}
                    effectiveZtTokens={effectiveZtTokens}
                    reservedTokens={reservedTokens}
                    sharedColumns={columns}
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
              groupSize={ztParseMode === 'fixedLength' ? fixedLength : 1}
              columns={columns}
              highlightedOTChar={highlightedOTChar}
              onToggleHighlightOT={toggleHighlightForOT}
              onLockAll={onLockAll}
              onQuickAssign={quickAssign}
              onExecuteQuickAssign={executeQuickAssign}
            />
          </div>
        </div>

                    <div>
              <div className="text-sm text-gray-600 mb-2">
                OT characters: {otChars.length} • ZT tokens: {ztParseMode === 'fixedLength' ? Math.floor(ztTokens.length / Math.max(1, fixedLength)) : ztTokens.length}
              </div>

              {mergeAllPrompt ? (
                <div className="mb-2 text-sm border border-gray-200 rounded p-2 bg-white flex items-center justify-between gap-3">
                  <div>
                    Found {mergeAllPrompt.remaining} more occurrence(s) of <span className="font-mono font-semibold">{mergeAllPrompt.pattern}</span>.
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                      onClick={dismissMergeAllPrompt}
                    >Dismiss</button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => mergeAllOccurrences(mergeAllPrompt?.pattern ?? '')}
                    >Merge all</button>
                  </div>
                </div>
              ) : null}
              
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
                onInsertRawCharsAfterPosition={onInsertRawCharsAfterPosition}
                onSplitGroup={onSplitGroup}
                canInsertRaw={true}
                canSplitGroup={true}
                highlightedOTChar={highlightedOTChar}
                columns={columns}
                shiftMeta={shiftMeta}
                onShiftGroupRight={shiftGroupRight}
                onShiftGroupLeft={shiftGroupLeft}
                activeDragType={activeDragInfo.type}
                activeOtSourceRow={activeDragInfo.otSourceRow}
                activeOtSourceCol={activeDragInfo.otSourceCol}
                activeZtTokenIndex={activeDragInfo.ztTokenIndex}
                keysPerOTMode={keysPerOTMode}
              />
            </div>
      </div>

      <DragOverlay>
        {activeDrag ? (
          (() => {
            interface DragData {
              type?: 'zt' | 'ot';
              token?: { id: string; text: string };
              otChar?: string;
            }
            const data = (activeDrag.data?.current ?? {}) as DragData;
            if (data?.type === 'zt') {
              const text = String(data?.token?.text ?? '');
              return (
                <span className="inline-block text-xs px-0.5 rounded font-mono border bg-white shadow-sm cursor-grabbing select-none">
                  {text}
                </span>
              );
            }
            if (data?.type === 'ot') {
              const ch = String(data?.otChar ?? '');
              return (
                <span className="inline-block px-1 rounded font-mono text-md font-bold bg-yellow-100 text-yellow-800 border border-yellow-300 shadow-sm cursor-grabbing select-none">
                  {ch}
                </span>
              );
            }
            return null;
          })()
        ) : null}
      </DragOverlay>

      </DndContext>
    </AppLayout>
  );
};

export default NomenklatorPage;
