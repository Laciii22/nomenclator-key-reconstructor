import type { KeysPerPTMode } from '../types/domain';

export type KeyExportEntry = {
  pt: string;
  ct: string | string[];
};

export type KeyExportData = {
  mode: KeysPerPTMode;
  /** PT → CT mapping. In single mode: string. In multiple mode: string[]. Only populated entries are included. */
  key: Record<string, string | string[]>;
};

/**
 * Builds the export data object from the aggregated key pairs.
 * Only includes entries that have at least one CT token assigned.
 */
export function buildKeyExportData(
  aggregated: { pt: string; ctList: string[] }[],
  mode: KeysPerPTMode,
): KeyExportData {
  const key: Record<string, string | string[]> = {};
  for (const row of aggregated) {
    if (row.ctList.length === 0) continue;
    if (mode === 'single') {
      key[row.pt] = row.ctList[0];
    } else {
      key[row.pt] = [...row.ctList];
    }
  }
  return {
    mode,
    key,
  };
}

/**
 * Triggers a browser download of the reconstructed nomenclator key as a JSON file.
 */
export function downloadKeyAsJson(
  aggregated: { pt: string; ctList: string[] }[],
  mode: KeysPerPTMode,
): void {
  const data = buildKeyExportData(aggregated, mode);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nomenclator-key-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
