import { useEffect, useState } from 'react';
import type { LockedKeys, KeysPerOTMode } from '../types/domain';


export type LocalSettings = {
  fixedPerOTEnabled: boolean;
  fixedPerOTSize: number;
  maxTokensCapEnabled: boolean;
  maxTokensPerCell: number;
  keysPerOTMode: KeysPerOTMode;
  lockedKeys: LockedKeys;
  otRaw: string;
  ztRaw: string;
  // indices (v pôvodnom ZT) presunuté do zátvoriek
  bracketedIndices: number[];
};

const KEY = 'nkr_settings';


/**
 * This hooks saves and loads local settings from localStorage.
 * @param initial Initial settings to use if none are stored.
 * @return A tuple containing the current settings and a function to update them.
 **/

export function useLocalSettings(initial?: Partial<LocalSettings>) {
  const [settings, setSettings] = useState<LocalSettings>({
    fixedPerOTEnabled: false,
    fixedPerOTSize: 1,
    maxTokensCapEnabled: false,
    maxTokensPerCell: 3,
    keysPerOTMode: 'multiple',
    lockedKeys: {},
    otRaw: '',
    ztRaw: '',
    bracketedIndices: [],
    ...initial,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalSettings>;
        setSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }, [settings]);

  return [settings, setSettings] as const;
}
