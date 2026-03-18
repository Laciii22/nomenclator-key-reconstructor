import { useEffect, useState } from 'react';
import type { LockedKeys, KeysPerPTMode } from '../types/domain';


export type LocalSettings = {
  fixedPerPTEnabled: boolean;
  fixedPerPTSize: number;
  maxTokensCapEnabled: boolean;
  maxTokensPerCell: number;
  keysPerPTMode: KeysPerPTMode;
  lockedKeys: LockedKeys;
  ptRaw: string;
  ctRaw: string;
  bracketedIndices: number[];
};

export const STORAGE_KEY = 'nkr_settings';
const KEY = STORAGE_KEY;

function loadFromStorage(initial?: Partial<LocalSettings>): LocalSettings {
  const defaults: LocalSettings = {
    fixedPerPTEnabled: false,
    fixedPerPTSize: 1,
    maxTokensCapEnabled: false,
    maxTokensPerCell: 3,
    keysPerPTMode: 'multiple',
    lockedKeys: {},
    ptRaw: '',
    ctRaw: '',
    bracketedIndices: [],
    ...initial,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<LocalSettings>) };
  } catch { /* ignore */ }
  return defaults;
}

/**
 * This hooks saves and loads local settings from localStorage.
 * Uses lazy initialization to read persisted state synchronously on first render,
 * which avoids the race where the write effect fires before the read effect applies.
 **/

export function useLocalSettings(initial?: Partial<LocalSettings>) {
  const [settings, setSettings] = useState<LocalSettings>(() => loadFromStorage(initial));

  useEffect(() => {
    try {
      //KEY is nkr_settings
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {console.warn('Failed to save settings to localStorage');}
  }, [settings]);

  return [settings, setSettings] as const;
}
