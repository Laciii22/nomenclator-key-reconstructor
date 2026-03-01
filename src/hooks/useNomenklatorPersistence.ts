import * as React from 'react';
import type { KeysPerPTMode } from '../types/domain';
import type { LocalSettings } from './useLocalSettings';
import type { PTChar } from '../types/domain';

export function useNomenklatorPersistence(params: {
  settings: LocalSettings;
  setSettings: React.Dispatch<React.SetStateAction<LocalSettings>>;
  hydratedRef: React.RefObject<boolean>;

  ptRaw: string;
  setPtRaw: React.Dispatch<React.SetStateAction<string>>;

  ctRaw: string;
  setCtRawSeparator: (raw: string) => void;
  setCtRawFixed: (raw: string) => void;

  keysPerPTMode: KeysPerPTMode;
  setKeysPerPTMode: React.Dispatch<React.SetStateAction<KeysPerPTMode>>;

  setLockedKeys: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>;
  setBracketedIndices: React.Dispatch<React.SetStateAction<number[]>>;
  setCustomPtGroups: React.Dispatch<React.SetStateAction<PTChar[] | null>>;
}) {
  const {
    settings,
    setSettings,
    hydratedRef,
    ptRaw,
    setPtRaw,
    ctRaw,
    setCtRawSeparator,
    setCtRawFixed,
    keysPerPTMode,
    setKeysPerPTMode,
    setLockedKeys,
    setBracketedIndices,
    setCustomPtGroups,
  } = params;

  // Hydration (avoid stale locks + brackets)
  React.useEffect(() => {
    if (hydratedRef.current) return;
    setPtRaw(settings.ptRaw ?? '');
    // Initialize both mode-specific raws from saved value to avoid surprising empty fields
    setCtRawSeparator(settings.ctRaw ?? '');
    setCtRawFixed(settings.ctRaw ?? '');
    setKeysPerPTMode((settings.keysPerPTMode as KeysPerPTMode) ?? 'single');
    setLockedKeys({});
    setBracketedIndices([]);
    setCustomPtGroups(null);
    hydratedRef.current = true;
  }, [hydratedRef, setBracketedIndices, setCustomPtGroups, setKeysPerPTMode, setLockedKeys, setPtRaw, setCtRawFixed, setCtRawSeparator, settings]);

  // Minimal persistence
  React.useEffect(() => {
    setSettings(p => (p.ptRaw === ptRaw ? p : { ...p, ptRaw }));
  }, [ptRaw, setSettings]);

  React.useEffect(() => {
    setSettings(p => (p.ctRaw === ctRaw ? p : { ...p, ctRaw }));
  }, [setSettings, ctRaw]);

  React.useEffect(() => {
    setSettings(p => (p.keysPerPTMode === keysPerPTMode ? p : { ...p, keysPerPTMode }));
  }, [keysPerPTMode, setSettings]);
}
