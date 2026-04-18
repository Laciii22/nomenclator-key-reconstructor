import React from 'react';
import type { Active, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, useSensors, useSensor, MouseSensor, TouchSensor, KeyboardSensor, pointerWithin, MeasuringStrategy } from '@dnd-kit/core';
import AppLayout from '../components/layout/AppLayout';
import MappingTable from '../components/table/MappingTable';
import KeyTable from '../components/table/KeyTable';
import BracketEditor from '../components/controls/BracketEditor';
import ParseControls from '../components/controls/ParseControls';
import CandidateSelectorFixed from '../components/controls/CandidateSelectorFixed';
import CandidateSelectorSeparator from '../components/controls/CandidateSelectorSeparator';
import CandidateSelectorMulti from '../components/controls/CandidateSelectorMulti';
import FileImport from '../components/controls/FileImport';
import { useNomenklator } from '../hooks/useNomenklator';
import { useBusyState } from '../hooks/nomenklator/useBusyState';
import { useDraftControls } from '../hooks/nomenklator/useDraftControls';
import type { SelectionMap, DragData } from '../types/domain';
import plusIcon from '../assets/icons/plus.png';
import dangerIcon from '../assets/icons/danger.png';
import questionIcon from '../assets/icons/question.png';

const FrequencyModal = React.lazy(() => import('../components/common/FrequencyModal'));
const HelpModal = React.lazy(() => import('../components/common/HelpModal'));

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
  const [isMappingPreviewUpdatedFlash, setIsMappingPreviewUpdatedFlash] = React.useState(false);
  const mappingPreviewFlashTimerRef = React.useRef<number | null>(null);

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
    shouldDeferSelectionMappingPreview,
    hasPendingMappingPreviewUpdate,
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
    markAnalysisStaleFromInput,
    onLockOT,
    onUnlockOT,
    onDragStart,
    onDragEnd,
    onDragCancel,
    toggleBracketGroupByText,
    chooseScoreOneSuggestions,
    applySelection,
    editCtToken,
    editPTAt,
    insertPTAt,
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
    clearAll,
    applySelectionsToMappingPreview,
  } = actions;

  const {
    isGridBusy,
    isAppBusy,
    appBusyLabel,
    runWithGridBusy,
    runWithAppBusy,
    setAppBusyLabel,
  } = useBusyState({
    minBusyMs: 220,
  });

  const {
    ptTextareaId,
    ctTextareaId,
    ptTextareaRef,
    ptInputDraft,
    ctInputDraft,
    ctParseModeDraft,
    separatorDraft,
    fixedLengthDraft,
    keysPerPTModeDraft,
    pendingRunAnalysis,
    canRunAnalysisFromDraft,
    onPtFocus,
    onPtBlur,
    onCtFocus,
    onCtBlur,
    onPtChange,
    onCtChange,
    onPtFileLoad,
    onCtFileLoad,
    onRunAnalysis,
    onChangeParseMode,
    onSeparatorChange,
    onFixedLengthChangeWithBusy,
    onKeysPerPTModeChange,
    onResetToPreAnalysis,
  } = useDraftControls({
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
    isAnalyzing,
    markAnalysisStaleFromInput,
    runAnalysis,
    resetToPreAnalysis,
    runWithAppBusy,
    setAppBusyLabel,
  });

  const uiBusyLabel = isGridBusy
    ? 'Updating mapping...'
    : pendingRunAnalysis
      ? 'Preparing analysis...'
      : isAnalyzing
        ? 'Analyzing...'
        : isAppBusy
          ? (appBusyLabel ?? 'Applying changes...')
          : null;

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

  const onMergeAllWithBusy = React.useCallback((pattern: string) => {
    runWithGridBusy(() => mergeAllOccurrences(pattern));
  }, [mergeAllOccurrences, runWithGridBusy]);

  const onEditTokenWithBusy = React.useCallback((tokenIndex: number, newText: string) => {
    runWithGridBusy(() => editCtToken(tokenIndex, newText));
  }, [editCtToken, runWithGridBusy]);

  const onInsertRawCharsAfterPositionWithBusy = React.useCallback((positionIndex: number, text: string, replace?: boolean) => {
    runWithGridBusy(() => insertRawCharsAfterPosition(positionIndex, text, replace));
  }, [insertRawCharsAfterPosition, runWithGridBusy]);

  const onEditPTAtWithBusy = React.useCallback((flatPtIndex: number, newText: string) => {
    runWithGridBusy(() => editPTAt(flatPtIndex, newText));
  }, [editPTAt, runWithGridBusy]);

  const onInsertPTAtWithBusy = React.useCallback((flatPtIndex: number, newText: string) => {
    runWithGridBusy(() => insertPTAt(flatPtIndex, newText));
  }, [insertPTAt, runWithGridBusy]);

  const onSplitPTAtWithBusy = React.useCallback((flatIndex: number) => {
    runWithGridBusy(() => splitPTAt(flatIndex));
  }, [runWithGridBusy, splitPTAt]);

  const onShiftGroupRightWithBusy = React.useCallback((flatIndex: number) => {
    runWithGridBusy(() => shiftGroupRight(flatIndex));
  }, [runWithGridBusy, shiftGroupRight]);

  const onShiftGroupLeftWithBusy = React.useCallback((flatIndex: number) => {
    runWithGridBusy(() => shiftGroupLeft(flatIndex));
  }, [runWithGridBusy, shiftGroupLeft]);

  const onExtractEdgeTokenByCtIndexWithBusy = React.useCallback((ctIndex: number, direction: 'left' | 'right') => {
    runWithGridBusy(() => extractEdgeTokenByCtIndex(ctIndex, direction));
  }, [extractEdgeTokenByCtIndex, runWithGridBusy]);

  const onReabsorbNullByDirectionWithBusy = React.useCallback((baseFlatIndex: number, direction: 'left' | 'right') => {
    runWithGridBusy(() => reabsorbNullByDirection(baseFlatIndex, direction));
  }, [reabsorbNullByDirection, runWithGridBusy]);

  const onUpdateMappingPreview = React.useCallback(() => {
    if (!hasPendingMappingPreviewUpdate) return;
    applySelectionsToMappingPreview();

    setIsMappingPreviewUpdatedFlash(true);
    if (mappingPreviewFlashTimerRef.current !== null) {
      window.clearTimeout(mappingPreviewFlashTimerRef.current);
    }
    mappingPreviewFlashTimerRef.current = window.setTimeout(() => {
      setIsMappingPreviewUpdatedFlash(false);
      mappingPreviewFlashTimerRef.current = null;
    }, 1200);
  }, [applySelectionsToMappingPreview, hasPendingMappingPreviewUpdate]);

  React.useEffect(() => {
    return () => {
      if (mappingPreviewFlashTimerRef.current !== null) {
        window.clearTimeout(mappingPreviewFlashTimerRef.current);
      }
    };
  }, []);

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
        // Only act if the edge is actually active (visible orange strip).
        // Otherwise ignore the drop — this prevents creating empty cells.
        if (!dst.active) {
          clearDragState();
          return;
        }
        if (activeCtIsFromNull && typeof activeNullInsertedAfterBaseFlatIndex === 'number') {
          onReabsorbNullByDirectionWithBusy(activeNullInsertedAfterBaseFlatIndex, dst.direction!);
        } else if (typeof activeDragInfo.ctTokenIndex === 'number') {
          onExtractEdgeTokenByCtIndexWithBusy(activeDragInfo.ctTokenIndex, dst.direction!);
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

    runWithGridBusy(() => onDragEnd(evt));
    clearDragState();
  }, [clearDragState, onDragEnd, activeCtIsFromNull, activeNullInsertedAfterBaseFlatIndex, activeDragInfo.ctTokenIndex, onReabsorbNullByDirectionWithBusy, onExtractEdgeTokenByCtIndexWithBusy, runWithGridBusy]);

  const handleDragCancel = React.useCallback(() => {
    onDragCancel();
    clearDragState();
  }, [clearDragState, onDragCancel]);
  
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const onClearPersistenceClick = React.useCallback(() => {
    if (window.confirm('Are you sure you want to clear all saved data? This cannot be undone.')) {
      clearAll();
    }
  }, [clearAll]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  // ESC  → clear saved data (with confirmation)
  // Shift → toggle Frequency modal
  // H    → toggle Help modal
  React.useEffect(() => {
    const isInteractiveElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (el as HTMLElement).isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never intercept when user is typing in a form element
      if (isInteractiveElement(document.activeElement)) return;

      // Prevent rapid open/close loops while holding a shortcut key
      if (e.repeat) return;

      if (e.key === 'Escape') {
        // Don't steal Escape when a modal is open — modals handle their own close
        if (isHelpOpen || isFrequencyOpen) return;
        e.preventDefault();
        onClearPersistenceClick();
        return;
      }

      if (e.key === 'F' || e.key === 'f') {
        e.preventDefault();
        setIsFrequencyOpen(prev => !prev);
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setIsHelpOpen(prev => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpOpen, isFrequencyOpen, onClearPersistenceClick]);

  return (
    <AppLayout
      onHelpClick={() => setIsHelpOpen(true)}
      onFrequencyClick={() => setIsFrequencyOpen(true)}
      onClearPersistenceClick={onClearPersistenceClick}
    >
      <React.Suspense fallback={null}>
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <FrequencyModal
          isOpen={isFrequencyOpen}
          onClose={() => setIsFrequencyOpen(false)}
          ptChars={ptChars}
          ctTokens={effectiveCtTokens}
          groupSize={ctParseMode === 'fixedLength' ? fixedLength : 1}
        />
      </React.Suspense>
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
        {uiBusyLabel && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" aria-hidden="true" />
            {uiBusyLabel}
          </div>
        )}
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
              ref={ptTextareaRef}
              id={ptTextareaId}
              rows={3}
              className="w-full font-mono text-sm border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 placeholder-gray-300"
              placeholder="[HELLO]WORLD"
              value={ptInputDraft}
              onChange={onPtChange}
              onFocus={onPtFocus}
              onBlur={onPtBlur}
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
              value={ctInputDraft}
              onChange={onCtChange}
              onFocus={onCtFocus}
              onBlur={onCtBlur}
            />

            {statusMessage && (
              <div
                className={`text-sm rounded-lg p-3 mt-2 border flex items-start gap-2 ${
                  klamacStatus === 'invalid'
                    ? 'text-red-700 bg-red-50 border-red-300'
                    : klamacStatus === 'needsNull'
                      ? 'text-red-700 bg-red-50 border-red-300'
                      : 'text-green-700 bg-green-50 border-green-300'
                }`}
              >
                <span className="mt-0.5 flex-shrink-0">
                  {klamacStatus === 'ok' ? (
                    <img src={questionIcon} alt="" aria-hidden="true" className="w-4 h-4" />
                ) : (
                    <img src={dangerIcon} alt="" aria-hidden="true" className="w-4 h-4" />
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
              lockedKeys={lockedKeys}
            />

            <ParseControls
              ctParseMode={ctParseModeDraft}
              onChangeMode={onChangeParseMode}
              separator={separatorDraft}
              onSeparatorChange={onSeparatorChange}
              fixedLength={fixedLengthDraft}
              onFixedLengthChange={onFixedLengthChangeWithBusy}
              keysPerPTMode={keysPerPTModeDraft}
              onKeysPerPTModeChange={onKeysPerPTModeChange}
              canRunAnalysis={canRunAnalysisFromDraft}
              onRunAnalysis={onRunAnalysis}
              onClear={onResetToPreAnalysis}
              isAnalyzing={isAnalyzing || pendingRunAnalysis}
              isBusy={isAppBusy}
            />


            {Object.keys(candidatesByChar).length > 0 && (
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-blue-800">Suggestions</h3>
                  <div className="flex gap-2">
                      {shouldDeferSelectionMappingPreview && (
                        <button
                          className={`text-xs px-2.5 py-1 rounded-md border ${
                            isMappingPreviewUpdatedFlash
                              ? 'border-green-500 bg-green-100 text-green-900 ring-1 ring-green-300 font-semibold'
                              :
                            hasPendingMappingPreviewUpdate
                              ? 'border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-900 ring-1 ring-amber-300 font-semibold'
                              : 'border-gray-300 bg-white text-gray-400 cursor-not-allowed'
                          }`}
                          onClick={onUpdateMappingPreview}
                          disabled={!hasPendingMappingPreviewUpdate}
                          title="Update Mapping Grid from current suggestions"
                        >
                          {isMappingPreviewUpdatedFlash
                            ? 'Mapping preview updated'
                            : (hasPendingMappingPreviewUpdate ? 'Update mapping preview (pending)' : 'Update mapping preview')}
                        </button>
                      )}
                      <button
                        className="text-xs px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-600"
                        onClick={onClearAll}
                        title="Clear all suggestions (locks and selections only)"
                      >
                        Clear all
                      </button>

                      <button
                        className="text-xs px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                        onClick={chooseScoreOneSuggestions}
                      >Preview</button>
                    <button
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      onClick={applySelection}
                    >
                      <img src={plusIcon} alt="" aria-hidden="true" className="w-3.5 h-3.5" />
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
                {shouldDeferSelectionMappingPreview && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                    PT has more than 200 characters. Changes in Suggestions are applied to Mapping Grid only after you click Update mapping preview.
                  </div>
                )}
                
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
              uniqueCTTokenTexts={uniqueCTTokenTexts}
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
                    <img src={questionIcon} alt="" aria-hidden="true" className="w-4 h-4 flex-shrink-0" />
                    Found <strong>{mergeAllPrompt.remaining}</strong> more occurrence(s) of <span className="font-mono font-semibold">{mergeAllPrompt.pattern}</span>.
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="text-xs px-2 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-50 text-amber-700"
                      onClick={dismissMergeAllPrompt}
                    >Dismiss</button>
                    <button
                      className={`text-xs px-2.5 py-1 rounded-md text-white font-medium ${
                        isGridBusy ? 'bg-amber-300 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600'
                      }`}
                      onClick={() => onMergeAllWithBusy(mergeAllPrompt?.pattern ?? '')}
                      disabled={isGridBusy}
                    >Merge all</button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between mb-2 mt-1">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mapping Grid</h3>
                <span className="text-xs text-gray-400 italic">Drag PT characters to merge , drag CT tokens to swap</span>
              </div>

              <div className="relative">
                <MappingTable
                  ptRows={ptRows}
                  ctTokens={effectiveCtTokens}
                  onLockOT={onLockOT}
                  onUnlockOT={onUnlockOT}
                  lockedKeys={lockedKeys}
                  hasDeceptionWarning={klamacStatus === 'needsNull'}
                  onEditToken={onEditTokenWithBusy}
                  onEditPTAt={onEditPTAtWithBusy}
                  onInsertPTAt={onInsertPTAtWithBusy}
                  groupSize={ctParseMode === 'fixedLength' ? fixedLength : 1}
                  onInsertRawCharsAfterPosition={onInsertRawCharsAfterPositionWithBusy}
                  onSplitGroup={onSplitPTAtWithBusy}
                  canInsertRaw={true}
                  canSplitGroup={true}
                  highlightedPTChar={highlightedPTChar}
                  columns={columns}
                  bracketedIndices={bracketedIndices}
                  shiftMeta={shiftMeta}
                  onShiftGroupRight={onShiftGroupRightWithBusy}
                  onShiftGroupLeft={onShiftGroupLeftWithBusy}
                  activeDragType={activeDragInfo.type}
                  activePtSourceRow={activeDragInfo.ptSourceRow}
                  activePtSourceCol={activeDragInfo.ptSourceCol}
                  activeCtTokenIndex={activeDragInfo.ctTokenIndex}
                  keysPerPTMode={keysPerPTMode}
                  activeCtIsFromNull={activeCtIsFromNull}
                  activeNullInsertedAfterBaseFlatIndex={activeNullInsertedAfterBaseFlatIndex}
                  activeCtSourceCellCount={activeCtSourceCellCount}
                />
                {isGridBusy && (
                  <div className="absolute inset-0 z-10 bg-white/65 backdrop-blur-[1px] rounded-md flex items-center justify-center pointer-events-none">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-blue-200 bg-white text-blue-700 text-xs font-medium shadow-sm">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" aria-hidden="true" />
                      Updating mapping...
                    </div>
                  </div>
                )}
              </div>
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
