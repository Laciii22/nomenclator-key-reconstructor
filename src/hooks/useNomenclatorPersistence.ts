import * as React from 'react';
import type { KeysPerPTMode, PTChar } from '../types/domain';
import type { LocalSettings } from './useLocalSettings';

export function useNomenclatorPersistence(params: {
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
  }, [
    hydratedRef,
    setBracketedIndices,
    setCustomPtGroups,
    setKeysPerPTMode,
    setLockedKeys,
    setPtRaw,
    setCtRawFixed,
    setCtRawSeparator,
    settings.ptRaw,
    settings.ctRaw,
    settings.keysPerPTMode,
  ]);

  // Minimal persistence: merge updates into a single state transition.
  React.useEffect(() => {
    setSettings(prev => {
      let changed = false;
      const next = { ...prev };

      if (prev.ptRaw !== ptRaw) {
        next.ptRaw = ptRaw;
        changed = true;
      }
      if (prev.ctRaw !== ctRaw) {
        next.ctRaw = ctRaw;
        changed = true;
      }
      if (prev.keysPerPTMode !== keysPerPTMode) {
        next.keysPerPTMode = keysPerPTMode;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [ptRaw, ctRaw, keysPerPTMode, setSettings]);
}
