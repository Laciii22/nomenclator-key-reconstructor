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
const STORAGE_VERSION = 1;

type StoredLocalSettingsV1 = {
  version: 1;
  settings: Partial<LocalSettings>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function sanitizeLockedKeys(value: unknown): LockedKeys {
  if (!isRecord(value)) return {};
  const out: LockedKeys = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      out[k] = v;
      continue;
    }
    if (Array.isArray(v)) {
      const filtered = v.filter((item): item is string => typeof item === 'string');
      if (filtered.length > 0) out[k] = filtered;
    }
  }
  return out;
}

function sanitizeBracketedIndices(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) continue;
    const normalized = Math.floor(item);
    if (normalized >= 0) set.add(normalized);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function sanitizeKeysPerPTMode(value: unknown, fallback: KeysPerPTMode): KeysPerPTMode {
  return value === 'single' || value === 'multiple' ? value : fallback;
}

function sanitizeSettings(rawSettings: unknown, defaults: LocalSettings): LocalSettings {
  if (!isRecord(rawSettings)) return defaults;
  return {
    fixedPerPTEnabled: typeof rawSettings.fixedPerPTEnabled === 'boolean' ? rawSettings.fixedPerPTEnabled : defaults.fixedPerPTEnabled,
    fixedPerPTSize: clampPositiveInt(rawSettings.fixedPerPTSize, defaults.fixedPerPTSize),
    maxTokensCapEnabled: typeof rawSettings.maxTokensCapEnabled === 'boolean' ? rawSettings.maxTokensCapEnabled : defaults.maxTokensCapEnabled,
    maxTokensPerCell: clampPositiveInt(rawSettings.maxTokensPerCell, defaults.maxTokensPerCell),
    keysPerPTMode: sanitizeKeysPerPTMode(rawSettings.keysPerPTMode, defaults.keysPerPTMode),
    lockedKeys: sanitizeLockedKeys(rawSettings.lockedKeys),
    ptRaw: typeof rawSettings.ptRaw === 'string' ? rawSettings.ptRaw : defaults.ptRaw,
    ctRaw: typeof rawSettings.ctRaw === 'string' ? rawSettings.ctRaw : defaults.ctRaw,
    bracketedIndices: sanitizeBracketedIndices(rawSettings.bracketedIndices),
  };
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function lockedKeysEqual(a: LockedKeys, b: LockedKeys): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) || Array.isArray(bv)) {
      if (!Array.isArray(av) || !Array.isArray(bv)) return false;
      if (!stringArraysEqual(av, bv)) return false;
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}

function localSettingsEqual(a: LocalSettings, b: LocalSettings): boolean {
  return (
    a.fixedPerPTEnabled === b.fixedPerPTEnabled
    && a.fixedPerPTSize === b.fixedPerPTSize
    && a.maxTokensCapEnabled === b.maxTokensCapEnabled
    && a.maxTokensPerCell === b.maxTokensPerCell
    && a.keysPerPTMode === b.keysPerPTMode
    && a.ptRaw === b.ptRaw
    && a.ctRaw === b.ctRaw
    && arraysEqual(a.bracketedIndices, b.bracketedIndices)
    && lockedKeysEqual(a.lockedKeys, b.lockedKeys)
  );
}

function extractStoredPayload(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  const version = parsed.version;
  if (version === STORAGE_VERSION && isRecord(parsed.settings)) {
    return parsed.settings;
  }
  // Backward compatibility with legacy unversioned shape.
  return parsed;
}

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
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const payload = extractStoredPayload(parsed);
      return sanitizeSettings(payload, defaults);
    }
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
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    try {
      //KEY is nkr_settings
      const payload: StoredLocalSettingsV1 = {
        version: STORAGE_VERSION,
        settings,
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
      setStorageWarning(null);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        setStorageWarning('Storage quota exceeded: settings could not be fully saved. Please clear older app data.');
      } else {
        setStorageWarning('Saving settings failed. Changes may not persist after refresh.');
      }
      console.warn('Failed to save settings to localStorage');
    }
  }, [settings]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      if (e.oldValue === e.newValue) return;
      setSettings(prev => {
        const next = loadFromStorage(prev);
        return localSettingsEqual(prev, next) ? prev : next;
      });
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [settings, setSettings, storageWarning] as const;
}
