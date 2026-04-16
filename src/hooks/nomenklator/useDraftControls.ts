import * as React from 'react';
import type { KeysPerPTMode } from '../../types/domain';

export function useDraftControls(params: {
  ptRaw: string;
  setPtRaw: React.Dispatch<React.SetStateAction<string>>;
  ctRaw: string;
  setCtRaw: (value: string) => void;
  ctParseMode: 'separator' | 'fixedLength';
  setCtParseMode: (mode: 'separator' | 'fixedLength') => void;
  separator: string;
  setSeparator: (value: string) => void;
  fixedLength: number;
  setFixedLength: (value: number) => void;
  keysPerPTMode: KeysPerPTMode;
  setKeysPerPTMode: React.Dispatch<React.SetStateAction<KeysPerPTMode>>;
  isAnalyzing: boolean;
  markAnalysisStaleFromInput: () => void;
  runAnalysis: () => void;
  resetToPreAnalysis: () => void;
  runWithAppBusy: (label: string, operation: () => void) => void;
  setAppBusyLabel: React.Dispatch<React.SetStateAction<string | null>>;
}) {
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
    isAnalyzing,
    markAnalysisStaleFromInput,
    runAnalysis,
    resetToPreAnalysis,
    runWithAppBusy,
    setAppBusyLabel,
  } = params;

  const [ptInputDraft, setPtInputDraft] = React.useState(ptRaw);
  const [ctInputDraft, setCtInputDraft] = React.useState(ctRaw);
  const [ctParseModeDraft, setCtParseModeDraft] = React.useState(ctParseMode);
  const [separatorDraft, setSeparatorDraft] = React.useState(separator);
  const [fixedLengthDraft, setFixedLengthDraft] = React.useState(fixedLength);
  const [keysPerPTModeDraft, setKeysPerPTModeDraft] = React.useState(keysPerPTMode);

  const ptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const ptInputFocusedRef = React.useRef(false);
  const ctInputFocusedRef = React.useRef(false);
  const pendingPtSelectionRef = React.useRef<{ start: number; end: number; direction?: 'forward' | 'backward' | 'none' } | null>(null);
  const [pendingRunAnalysis, setPendingRunAnalysis] = React.useState(false);

  React.useEffect(() => {
    if (ptInputFocusedRef.current) return;
    setPtInputDraft(ptRaw);
  }, [ptRaw]);

  React.useEffect(() => {
    if (ctInputFocusedRef.current) return;
    setCtInputDraft(ctRaw);
  }, [ctRaw]);

  React.useEffect(() => {
    setCtParseModeDraft(ctParseMode);
  }, [ctParseMode]);

  React.useEffect(() => {
    setSeparatorDraft(separator);
  }, [separator]);

  React.useEffect(() => {
    setFixedLengthDraft(fixedLength);
  }, [fixedLength]);

  React.useEffect(() => {
    setKeysPerPTModeDraft(keysPerPTMode);
  }, [keysPerPTMode]);

  React.useLayoutEffect(() => {
    if (!ptInputFocusedRef.current) return;
    const pending = pendingPtSelectionRef.current;
    const el = ptTextareaRef.current;
    if (!pending || !el) return;
    el.setSelectionRange(pending.start, pending.end, pending.direction);
    pendingPtSelectionRef.current = null;
  }, [ptInputDraft]);

  const onPtFocus = React.useCallback(() => {
    ptInputFocusedRef.current = true;
  }, []);

  const onPtBlur = React.useCallback(() => {
    ptInputFocusedRef.current = false;
    pendingPtSelectionRef.current = null;
  }, []);

  const onCtFocus = React.useCallback(() => {
    ctInputFocusedRef.current = true;
  }, []);

  const onCtBlur = React.useCallback(() => {
    ctInputFocusedRef.current = false;
  }, []);

  const onPtChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    markAnalysisStaleFromInput();
    pendingPtSelectionRef.current = {
      start: e.target.selectionStart,
      end: e.target.selectionEnd,
      direction: e.target.selectionDirection ?? 'none',
    };
    const next = e.target.value.toUpperCase();
    setPtInputDraft(next);
  }, [markAnalysisStaleFromInput]);

  const onCtChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    markAnalysisStaleFromInput();
    setCtInputDraft(e.target.value);
  }, [markAnalysisStaleFromInput]);

  const onPtFileLoad = React.useCallback((content: string) => {
    markAnalysisStaleFromInput();
    setPtInputDraft(content.toUpperCase());
  }, [markAnalysisStaleFromInput]);

  const onCtFileLoad = React.useCallback((content: string) => {
    markAnalysisStaleFromInput();
    setCtInputDraft(content);
  }, [markAnalysisStaleFromInput]);

  const canRunAnalysisFromDraft = React.useMemo(() => {
    return ptInputDraft.replace(/\s/g, '').length > 0 && ctInputDraft.trim().length > 0;
  }, [ctInputDraft, ptInputDraft]);

  const onRunAnalysis = React.useCallback(() => {
    if (!canRunAnalysisFromDraft || isAnalyzing) return;
    setAppBusyLabel('Preparing analysis...');
    setPtRaw(ptInputDraft);
    setCtRaw(ctInputDraft);
    setPendingRunAnalysis(true);
  }, [canRunAnalysisFromDraft, ctInputDraft, isAnalyzing, ptInputDraft, setAppBusyLabel, setCtRaw, setPtRaw]);

  React.useEffect(() => {
    if (!pendingRunAnalysis) return;
    if (ptRaw !== ptInputDraft) return;
    if (ctRaw !== ctInputDraft) return;
    setPendingRunAnalysis(false);
    runAnalysis();
  }, [ctInputDraft, ctRaw, pendingRunAnalysis, ptInputDraft, ptRaw, runAnalysis]);

  const onChangeParseMode = React.useCallback((mode: 'separator' | 'fixedLength') => {
    setCtParseModeDraft(mode);
    runWithAppBusy('Applying parse mode...', () => {
      setCtParseMode(mode);
    });
  }, [runWithAppBusy, setCtParseMode]);

  const onSeparatorChange = React.useCallback((sep: string) => {
    setSeparatorDraft(sep);
    runWithAppBusy('Updating separator...', () => {
      setSeparator(sep);
    });
  }, [runWithAppBusy, setSeparator]);

  const onFixedLengthChangeWithBusy = React.useCallback((value: number) => {
    const normalized = Math.max(1, value);
    setFixedLengthDraft(normalized);
    runWithAppBusy('Updating token length...', () => {
      setFixedLength(normalized);
    });
  }, [runWithAppBusy, setFixedLength]);

  const onKeysPerPTModeChange = React.useCallback((mode: 'single' | 'multiple') => {
    setKeysPerPTModeDraft(mode);
    runWithAppBusy('Updating key mode...', () => {
      setKeysPerPTMode(mode);
    });
  }, [runWithAppBusy, setKeysPerPTMode]);

  const onResetToPreAnalysis = React.useCallback(() => {
    runWithAppBusy('Resetting state...', () => {
      resetToPreAnalysis();
    });
  }, [resetToPreAnalysis, runWithAppBusy]);

  return {
    ptTextareaId: 'pt-raw',
    ctTextareaId: 'ct-raw',
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
  } as const;
}
