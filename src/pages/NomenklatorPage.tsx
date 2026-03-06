import React from 'react';
import type { Active, DragStartEvent, DragEndEvent, DragCancelEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, useSensors, useSensor, MouseSensor, TouchSensor, KeyboardSensor, pointerWithin, MeasuringStrategy } from '@dnd-kit/core';
import AppLayout from '../components/layout/AppLayout';
import FrequencyModal from '../components/common/FrequencyModal';
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
import type { SelectionMap, DragData } from '../types/domain';

/**
 * Main interactive page for reconstructing a nomenclator key from PT (plain text)
 * and CT (cipher text tokens).
 *
 * The UI is intentionally split into three vertical concerns:
 * - Inputs + parsing controls
 * - Suggestions/selection helpers
 * - Mapping + key tables
 */
const NomenklatorPage: React.FC = () => {

  const { inputs, state, derived, actions } = useNomenklator();
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [isFrequencyOpen, setIsFrequencyOpen] = React.useState(false);

  const {
    ptRaw,
    setPtRaw,
    ctRaw,
    setCtRaw,
    ctParseMode,
    setCtParseMode,
    separator,
    setSeparator,
    fixedLength,
    setFixedLength,
    keysPerPTMode,
    setKeysPerPTMode,
  } = inputs;

  const {
    lockedKeys,
    setLockedKeys,
    selections,
    setSelections,
    candidatesByChar,
    klamacStatus,
    statusMessage,
    bracketedIndices,
    setBracketedIndices,
    bracketWarning,
    analysisDone,
    isAnalyzing,
    selectionError,
    mergeAllPrompt,
    highlightedPTChar,
  } = state;

  const {
    ptChars,
    ctTokens,
    effectiveCtTokens,
    ptRows,
    columns,
    uniqueCTTokenTexts,
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
    editCtToken,
    insertRawCharsAfterPosition,
    splitPTAt,
    shiftGroupRight,
    shiftGroupLeft,
    extractEdgeTokenByCtIndex,
    reabsorbNullByDirection,
    mergeAllOccurrences,
    dismissMergeAllPrompt,
    toggleHighlightForOT,
    quickAssign,
    executeQuickAssign,
    resetToPreAnalysis,
  } = actions;

  const ptTextareaId = 'pt-raw';
  const ctTextareaId = 'ct-raw';

  const onPtChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPtRaw(e.target.value.toUpperCase());
  }, [setPtRaw]);

  const onCtChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCtRaw(e.target.value);
  }, [setCtRaw]);

  const onPtFileLoad = React.useCallback((content: string) => {
    setPtRaw(content.toUpperCase());
  }, [setPtRaw]);

  const onCtFileLoad = React.useCallback((content: string) => {
    setCtRaw(content);
  }, [setCtRaw]);

  const onFixedLengthChange = React.useCallback((v: number) => {
    setFixedLength(Math.max(1, v));
  }, [setFixedLength]);

  const onClearAll = React.useCallback(() => {
    // Only clear suggestions (selections and locks), not entire app state
    setSelections({});
    setLockedKeys({});
  }, [setLockedKeys, setSelections]);

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

  const [activeDrag, setActiveDrag] = React.useState<Active | null>(null);

  const activeDragInfo = React.useMemo(() => {
    const data = (activeDrag?.data?.current ?? {}) as DragData;
    const type = data?.type === 'ct' || data?.type === 'pt' ? (data.type as 'ct' | 'pt') : undefined;
    return {
      type,
      ptSourceRow: typeof data?.sourceRow === 'number' ? (data.sourceRow as number) : undefined,
      ptSourceCol: typeof data?.sourceCol === 'number' ? (data.sourceCol as number) : undefined,
      ctTokenIndex: typeof data?.tokenIndex === 'number' ? (data.tokenIndex as number) : null,
    };
  }, [activeDrag]);

  // Compute info about the cell that is currently being dragged from (CT drag only).
  // This is used to gate strip activation (>1 token required for extraction)
  // and to route reabsorb vs extract in the drop handler.
  const { activeCtIsFromNull, activeNullInsertedAfterBaseFlatIndex, activeCtSourceCellCount } = React.useMemo(() => {
    const idx = activeDragInfo.ctTokenIndex;
    if (idx === null || idx === undefined) {
      return { activeCtIsFromNull: false, activeNullInsertedAfterBaseFlatIndex: null, activeCtSourceCellCount: 0 };
    }
    for (const row of columns) {
      for (const cell of row) {
        if (!cell.ct.includes(idx)) continue;
        if (cell.deception && typeof cell.insertedAfterBaseFlatIndex === 'number') {
          return {
            activeCtIsFromNull: true,
            activeNullInsertedAfterBaseFlatIndex: cell.insertedAfterBaseFlatIndex,
            activeCtSourceCellCount: cell.ct.length,
          };
        }
        return {
          activeCtIsFromNull: false,
          activeNullInsertedAfterBaseFlatIndex: null,
          activeCtSourceCellCount: cell.ct.length,
        };
      }
    }
    return { activeCtIsFromNull: false, activeNullInsertedAfterBaseFlatIndex: null, activeCtSourceCellCount: 0 };
  }, [activeDragInfo.ctTokenIndex, columns]);

  const handleDragStart = React.useCallback((evt: DragStartEvent) => {
    setActiveDrag(evt.active);
    onDragStart();
  }, [onDragStart]);

  const clearDragState = React.useCallback(() => {
    setActiveDrag(null);
  }, []);

  const handleDragEnd = React.useCallback((evt: DragEndEvent) => {
    const src = evt.active?.data?.current as DragData | undefined;
    const dst = evt.over?.data?.current as DragData | undefined;

    // CT token dropped on a left/right edge strip → extract or reabsorb null cell
    if (src?.type === 'ct' && dst?.type === 'ct-edge') {
      if (dst.active) {
        if (activeCtIsFromNull && typeof activeNullInsertedAfterBaseFlatIndex === 'number') {
          reabsorbNullByDirection(activeNullInsertedAfterBaseFlatIndex, dst.direction!);
        } else if (typeof activeDragInfo.ctTokenIndex === 'number') {
          extractEdgeTokenByCtIndex(activeDragInfo.ctTokenIndex, dst.direction!);
        }
      }
      clearDragState();
      return;
    }

    // If token from an injected null cell was dropped somewhere other than an active edge strip
    // (e.g. mid-air, on a regular CT slot), ignore completely — the null cell must stay intact.
    if (src?.type === 'ct' && activeCtIsFromNull) {
      clearDragState();
      return;
    }

    onDragEnd(evt);
    clearDragState();
  }, [clearDragState, onDragEnd, activeCtIsFromNull, activeNullInsertedAfterBaseFlatIndex, activeDragInfo.ctTokenIndex, reabsorbNullByDirection, extractEdgeTokenByCtIndex]);

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
    <AppLayout onHelpClick={() => setIsHelpOpen(true)} onFrequencyClick={() => setIsFrequencyOpen(true)}>
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <FrequencyModal
        isOpen={isFrequencyOpen}
        onClose={() => setIsFrequencyOpen(false)}
        ptChars={ptChars}
        ctTokens={effectiveCtTokens}
        groupSize={ctParseMode === 'fixedLength' ? fixedLength : 1}
      />
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
        {/* Step progress indicator */}
        {(() => {
          const hasInputs = ptChars.length > 0 && ctTokens.length > 0;
          const hasAnalysis = analysisDone;
          const hasKeys = Object.keys(lockedKeys).length > 0;
          const step = hasKeys ? 4 : hasAnalysis ? 3 : hasInputs ? 2 : 1;
          const steps = [
            { n: 1, label: 'Enter texts' },
            { n: 2, label: 'Configure & Analyze' },
            { n: 3, label: 'Review suggestions' },
            { n: 4, label: 'Key table' },
          ];
          return (
            <div className="flex items-center gap-1 mb-6 select-none">
              {steps.map((s, i) => (
                <React.Fragment key={s.n}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      step > s.n ? 'bg-green-500 text-white' : step === s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>{step > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline ${
                      step === s.n ? 'text-blue-700' : step > s.n ? 'text-green-600' : 'text-gray-400'
                    }`}>{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-px max-w-12 ${
                      step > s.n ? 'bg-green-400' : 'bg-gray-200'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          );
        })()}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-4 lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs text-gray-500 -mt-1 mb-1">Enter the plain text and cipher text, then configure parsing and run the analysis.</p>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-semibold text-gray-700" htmlFor={ptTextareaId}>Plain text (PT)</label>
                <p className="text-xs text-gray-400"> Use <span className="font-mono">[brackets]</span> for multi-char tokens, e.g. <span className="font-mono">[HELLO]WORLD</span></p>
              </div>
              <FileImport label="Import PT" onFileLoad={onPtFileLoad} />
            </div>
            <textarea
              id={ptTextareaId}
              rows={3}
              className="w-full font-mono text-sm border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 placeholder-gray-300"
              placeholder="[HELLO]WORLD"
              value={ptRaw}
              onChange={onPtChange}
            />

            <div className="flex items-center justify-between mt-1">
              <div>
                <label className="block text-sm font-semibold text-gray-700" htmlFor={ctTextareaId}>Cipher text (CT)</label>
                <p className="text-xs text-gray-400">Tokens separated by space, or a single continuous string, e.g. <span className="font-mono">11:22:33:33:44</span></p>
              </div>
              <FileImport label="Import CT" onFileLoad={onCtFileLoad} />
            </div>
            <textarea
              id={ctTextareaId}
              rows={3}
              className="w-full font-mono text-sm border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 placeholder-gray-300"
              placeholder="11 34 12 12 56"
              value={ctRaw}
              onChange={onCtChange}
            />

            {statusMessage && (
              <div
                className={`text-sm rounded-lg p-3 mt-2 border flex items-start gap-2 ${
                  klamacStatus === 'invalid'
                    ? 'text-red-700 bg-red-50 border-red-300'
                    : klamacStatus === 'needsKlamac'
                      ? 'text-red-700 bg-red-50 border-red-300'
                      : 'text-green-700 bg-green-50 border-green-300'
                }`}
              >
                <span className="mt-0.5 flex-shrink-0">
                  {klamacStatus === 'ok' ? (
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  )}
                </span>
                <span>{statusMessage}</span>
              </div>
            )}

            <BracketEditor
              ctTokens={ctTokens}
              analysisDone={analysisDone}
              bracketWarning={bracketWarning}
              uniqueCTTokenTexts={uniqueCTTokenTexts}
              onToggleText={toggleBracketGroupByText}
              onClear={() => setBracketedIndices([])}
            />

            <ParseControls
              ctParseMode={ctParseMode}
              onChangeMode={setCtParseMode}
              separator={separator}
              onSeparatorChange={setSeparator}
              fixedLength={fixedLength}
              onFixedLengthChange={onFixedLengthChange}
              keysPerPTMode={keysPerPTMode}
              onKeysPerPTModeChange={setKeysPerPTMode}
              canRunAnalysis={!(ptChars.length === 0 || ctTokens.length === 0)}
              onRunAnalysis={runAnalysis}
              onClear={resetToPreAnalysis}
              isAnalyzing={isAnalyzing}
            />


            {Object.keys(candidatesByChar).length > 0 && (
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-blue-800">Suggestions</h3>
                  <div className="flex gap-2">
                      <button
                        className="text-xs px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-600"
                        onClick={onClearAll}
                        title="Clear all suggestions (locks and selections only)"
                      >
                        Clear all
                      </button>

                      {keysPerPTMode !== 'multiple' && (
                        <button
                          className="text-xs px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                          onClick={chooseScoreOneSuggestions}
                        >Preview</button>
                      )}
                    <button
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      onClick={applySelection}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      Apply
                    </button>
                  </div>
                </div>
                {selectionError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {selectionError}
                  </div>
                )}
                
                <div className="text-xs text-gray-500 mb-2">
                  Mode: {keysPerPTMode === 'multiple' ? 'Multi-key (homophones)' : 'Single-key'}
                </div>
                
                {keysPerPTMode === 'multiple' ? (
                  <CandidateSelectorMulti
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys}
                    selections={selections}
                    setSelections={setSelections}
                    ptRows={ptRows}
                    effectiveCtTokens={effectiveCtTokens}
                    reservedTokens={reservedTokens}
                    sharedColumns={columns}
                  />
                ) : ctParseMode === 'fixedLength' ? (
                  <CandidateSelectorFixed
                    candidatesByChar={candidatesByChar}
                    lockedKeys={lockedKeys as Record<string, string>}
                    selections={selections}
                    setSelections={setSelections}
                    ptRows={ptRows}
                    effectiveCtTokens={effectiveCtTokens}
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
                    ptRows={ptRows}
                    effectiveCtTokens={effectiveCtTokens}
                    reservedTokens={reservedTokens}
                    sharedColumns={columns}
                  />
                )}
              </div>
            )}

          </div>

          <div className="space-y-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Key Table</h3>
            <KeyTable
              ptRows={ptRows}
              ctTokens={effectiveCtTokens}
              keysPerPTMode={keysPerPTMode}
              lockedKeys={lockedKeys}
              selections={selections}
              onLockOT={onLockOT}
              onUnlockOT={onUnlockOT}
              ctParseMode={ctParseMode}
              groupSize={ctParseMode === 'fixedLength' ? fixedLength : 1}
              columns={columns}
              highlightedPTChar={highlightedPTChar}
              onToggleHighlightOT={toggleHighlightForOT}
              onLockAll={onLockAll}
              onQuickAssign={quickAssign}
              onExecuteQuickAssign={executeQuickAssign}
              bracketedIndices={bracketedIndices}
            />
          </div>
        </div>

                    <div>
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span>PT characters: <strong>{ptChars.length}</strong></span>
                <span>CT tokens: <strong>{ctParseMode === 'fixedLength' ? Math.floor(ctTokens.length / Math.max(1, fixedLength)) : ctTokens.length}</strong></span>
              </div>

              {mergeAllPrompt ? (
                <div className="mb-2 text-sm border border-amber-200 rounded-lg p-3 bg-amber-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z"/></svg>
                    Found <strong>{mergeAllPrompt.remaining}</strong> more occurrence(s) of <span className="font-mono font-semibold">{mergeAllPrompt.pattern}</span>.
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="text-xs px-2 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-50 text-amber-700"
                      onClick={dismissMergeAllPrompt}
                    >Dismiss</button>
                    <button
                      className="text-xs px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-medium"
                      onClick={() => mergeAllOccurrences(mergeAllPrompt?.pattern ?? '')}
                    >Merge all</button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between mb-2 mt-1">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mapping Grid</h3>
                <span className="text-xs text-gray-400 italic">Drag PT characters to merge , drag CT tokens to swap</span>
              </div>

              <MappingTable
                ptRows={ptRows}
                ctTokens={effectiveCtTokens}
                onLockOT={onLockOT}
                onUnlockOT={onUnlockOT}
                lockedKeys={lockedKeys}
                hasDeceptionWarning={klamacStatus === 'needsKlamac'}
                onEditToken={editCtToken}
                selections={selections}
                groupSize={ctParseMode === 'fixedLength' ? fixedLength : 1}
                onInsertRawCharsAfterPosition={insertRawCharsAfterPosition}
                onSplitGroup={splitPTAt}
                canInsertRaw={true}
                canSplitGroup={true}
                highlightedPTChar={highlightedPTChar}
                columns={columns}
                bracketedIndices={bracketedIndices}
                shiftMeta={shiftMeta}
                onShiftGroupRight={shiftGroupRight}
                onShiftGroupLeft={shiftGroupLeft}
                activeDragType={activeDragInfo.type}
                activePtSourceRow={activeDragInfo.ptSourceRow}
                activePtSourceCol={activeDragInfo.ptSourceCol}
                activeCtTokenIndex={activeDragInfo.ctTokenIndex}
                keysPerPTMode={keysPerPTMode}
                activeCtIsFromNull={activeCtIsFromNull}
                activeNullInsertedAfterBaseFlatIndex={activeNullInsertedAfterBaseFlatIndex}
                activeCtSourceCellCount={activeCtSourceCellCount}
              />
            </div>
      </div>

      <DragOverlay>
        {activeDrag ? (
          (() => {
            const data = (activeDrag.data?.current ?? {}) as DragData;
            if (data?.type === 'ct') {
              const text = String(data?.token?.text ?? '');
              return (
                <span className="inline-block text-xs px-0.5 rounded font-mono border bg-white shadow-sm cursor-grabbing select-none">
                  {text}
                </span>
              );
            }
            if (data?.type === 'pt') {
              const ch = String(data?.ptChar ?? '');
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
