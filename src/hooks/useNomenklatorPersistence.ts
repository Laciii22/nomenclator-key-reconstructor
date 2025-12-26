import * as React from 'react';
import type { KeysPerOTMode } from '../components/types';
import type { LocalSettings } from './useLocalSettings';

export function useNomenklatorPersistence(params: {
  settings: LocalSettings;
  setSettings: React.Dispatch<React.SetStateAction<LocalSettings>>;
  hydratedRef: React.MutableRefObject<boolean>;

  otRaw: string;
  setOtRaw: React.Dispatch<React.SetStateAction<string>>;

  ztRaw: string;
  setZtRawSeparator: (raw: string) => void;
  setZtRawFixed: (raw: string) => void;

  keysPerOTMode: KeysPerOTMode;
  setKeysPerOTMode: React.Dispatch<React.SetStateAction<KeysPerOTMode>>;

  setLockedKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setBracketedIndices: React.Dispatch<React.SetStateAction<number[]>>;
  setCustomOtGroups: React.Dispatch<React.SetStateAction<any>>;
}) {
  const {
    settings,
    setSettings,
    hydratedRef,
    otRaw,
    setOtRaw,
    ztRaw,
    setZtRawSeparator,
    setZtRawFixed,
    keysPerOTMode,
    setKeysPerOTMode,
    setLockedKeys,
    setBracketedIndices,
    setCustomOtGroups,
  } = params;

  // Hydration (avoid stale locks + brackets)
  React.useEffect(() => {
    if (hydratedRef.current) return;
    setOtRaw(settings.otRaw ?? '');
    // Initialize both mode-specific raws from saved value to avoid surprising empty fields
    setZtRawSeparator(settings.ztRaw ?? '');
    setZtRawFixed(settings.ztRaw ?? '');
    setKeysPerOTMode((settings.keysPerOTMode as KeysPerOTMode) ?? 'single');
    setLockedKeys({});
    setBracketedIndices([]);
    setCustomOtGroups(null);
    hydratedRef.current = true;
  }, [hydratedRef, setBracketedIndices, setCustomOtGroups, setKeysPerOTMode, setLockedKeys, setOtRaw, setZtRawFixed, setZtRawSeparator, settings]);

  // Minimal persistence
  React.useEffect(() => {
    setSettings(p => (p.otRaw === otRaw ? p : { ...p, otRaw }));
  }, [otRaw, setSettings]);

  React.useEffect(() => {
    setSettings(p => (p.ztRaw === ztRaw ? p : { ...p, ztRaw }));
  }, [setSettings, ztRaw]);

  React.useEffect(() => {
    setSettings(p => (p.keysPerOTMode === keysPerOTMode ? p : { ...p, keysPerOTMode }));
  }, [keysPerOTMode, setSettings]);
}
