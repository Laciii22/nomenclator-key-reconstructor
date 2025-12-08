// Shared domain types used across the app
export type ZTToken = {
  id: string;
  text: string;
};

export type OTChar = {
  id: string;
  ch: string;
};

export type KeysPerOTMode = 'single' | 'multiple';

export type LockedKeys = Record<string, string>;

// Generic selection map: OT char -> selected token or null
export type SelectionMap = Record<string, string | null>;
