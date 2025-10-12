import React, { useMemo, useState } from "react";

export type OTChar = { id: string; ch: string };
export type ZTToken = { id: string; text: string; locked?: boolean };

export type LoadedGrid = {
  otRaw: string;
  ztRaw: string;
  otChars: OTChar[];
  ztTokens: ZTToken[];
  cols: number; 
  rows: number; 
  otRows: OTChar[][];
  ztRows: ZTToken[][];
};

export type FileLoaderProps = {
  onLoaded?: (grid: LoadedGrid) => void;
  minCols?: number;
  maxCols?: number;
};

const uid = (() => {
  let n = 0;
  return () => `id_${(n++).toString(36)}`;
})();

function normalizeAlnum(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function splitTokens(input: string, delimiter: string | null): string[] {
  if (!input.trim()) return [];
  if (!delimiter || delimiter.trim() === "") {
    return input.trim().split(/\s+/);
  }
  try {
    const m = delimiter.match(/^\/(.+)\/([gimuy]*)$/);
    if (m) {
      const rx = new RegExp(m[1], m[2]);
      return input.split(rx).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return input.split(delimiter).map(s => s.trim()).filter(Boolean);
}

function autoPickCols(otLen: number, ztLen: number, minCols: number, maxCols: number): number {
  let bestK = Math.max(minCols, Math.min(maxCols, 20));
  let bestScore = Number.POSITIVE_INFINITY;
  for (let k = minCols; k <= maxCols; k++) {
    const rowsOT = Math.ceil(otLen / k);
    const rowsZT = Math.ceil(ztLen / k);
    const score = Math.abs(rowsOT - rowsZT);
    const bias = Math.abs(k - (minCols + maxCols) / 2) / (maxCols - minCols + 1);
    const finalScore = score + bias * 0.05;
    if (finalScore < bestScore) {
      bestScore = finalScore;
      bestK = k;
    }
    if (score === 0) {
      bestK = k;
      break;
    }
  }
  return bestK;
}

function chunkPadOT(otChars: OTChar[], cols: number, totalRows: number): OTChar[][] {
  const rows: OTChar[][] = [];
  for (let r = 0; r < totalRows; r++) {
    const start = r * cols;
    const slice = otChars.slice(start, start + cols);
    while (slice.length < cols) {
      slice.push({ id: uid(), ch: "" });
    }
    rows.push(slice);
  }
  return rows;
}

function chunkPadZT(ztTokens: ZTToken[], cols: number, totalRows: number): ZTToken[][] {
  const rows: ZTToken[][] = [];
  for (let r = 0; r < totalRows; r++) {
    const start = r * cols;
    const slice = ztTokens.slice(start, start + cols);
    while (slice.length < cols) {
      slice.push({ id: uid(), text: "" });
    }
    rows.push(slice);
  }
  return rows;
}

const FileLoader: React.FC<FileLoaderProps> = ({ onLoaded, minCols = 5, maxCols = 60 }) => {
  const [otRaw, setOtRaw] = useState("");
  const [ztRaw, setZtRaw] = useState("");
  const [normalize, setNormalize] = useState(true);
  const [ztDelimiter, setZtDelimiter] = useState<string | null>(null);
  const [manualCols, setManualCols] = useState<number | "">("");
  const [useAuto, setUseAuto] = useState(true);

  const otNormalized = useMemo(() => (normalize ? normalizeAlnum(otRaw) : otRaw), [otRaw, normalize]);
  const ztTokenTexts = useMemo(() => splitTokens(ztRaw, ztDelimiter), [ztRaw, ztDelimiter]);

  const otChars: OTChar[] = useMemo(
    () => Array.from(otNormalized).map(ch => ({ id: uid(), ch })),
    [otNormalized]
  );

  const ztTokens: ZTToken[] = useMemo(
    () => ztTokenTexts.map(t => ({ id: uid(), text: t })),
    [ztTokenTexts]
  );

  const cols = useMemo(() => {
    if (!useAuto && typeof manualCols === "number" && manualCols >= minCols && manualCols <= maxCols) {
      return manualCols;
    }
    return autoPickCols(otChars.length, ztTokens.length, minCols, maxCols);
  }, [useAuto, manualCols, minCols, maxCols, otChars.length, ztTokens.length]);

  const rows = useMemo(() => {
    const rOT = Math.ceil((otChars.length || 1) / cols);
    const rZT = Math.ceil((ztTokens.length || 1) / cols);
    return Math.max(rOT, rZT);
  }, [cols, otChars.length, ztTokens.length]);

  const otRows = useMemo(() => chunkPadOT(otChars, cols, rows), [otChars, cols, rows]);
  const ztRows = useMemo(() => chunkPadZT(ztTokens, cols, rows), [ztTokens, cols, rows]);

  const canLoad = otChars.length > 0 && ztTokens.length > 0;

  function emit() {
    if (!onLoaded) return;
    onLoaded({
      otRaw,
      ztRaw,
      otChars,
      ztTokens,
      cols,
      rows,
      otRows,
      ztRows,
    });
  }

  async function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsText(file, "utf-8");
    });
  }

  return (
    <div className="grid gap-3 max-w-4xl mx-auto">
      <h3 className="text-lg font-semibold">Načítať OT / ZT</h3>
      {/* UI rovnaké ako predtým, skrátené pre prehľadnosť */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-sm font-medium">OT súbor (.txt):</label>
          <input
            type="file"
            accept=".txt"
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setOtRaw(await readFile(f));
              e.currentTarget.value = "";
            }}
          />
          <label className="block mt-2 text-sm text-gray-600">alebo prilep OT:</label>
          <textarea
            placeholder="Vložiť otvorený text (OT)"
            rows={8}
            className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={otRaw}
            onChange={(e) => setOtRaw(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">ZT súbor (.txt):</label>
          <input
            type="file"
            accept=".txt"
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setZtRaw(await readFile(f));
              e.currentTarget.value = "";
            }}
          />
          <label className="block mt-2 text-sm text-gray-600">alebo prilep ZT:</label>
          <textarea
            placeholder="Vložiť šifrovaný text (ZT)"
            rows={8}
            className="w-full font-mono border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={ztRaw}
            onChange={(e) => setZtRaw(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
          />
          <span>Normalizovať OT na alfanumerické (A–Z, 0–9)</span>
        </label>

        <label className="inline-flex items-center gap-2">
          <span>Oddeľovač ZT tokenov:</span>
          <input
            type="text"
            placeholder="prázdne = whitespace, alebo /regex/"
            value={ztDelimiter ?? ""}
            onChange={(e) => setZtDelimiter(e.target.value || null)}
            className="w-56 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={useAuto}
            onChange={(e) => setUseAuto(e.target.checked)}
          />
          <span>Auto dĺžka riadku</span>
        </label>

        <label className="inline-flex items-center gap-2">
          <span>Manuálna dĺžka:</span>
          <input
            type="number"
            min={5}
            max={120}
            value={manualCols}
            disabled={useAuto}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") setManualCols("");
              else setManualCols(Math.max(1, Math.min(120, Number(v))));
            }}
            className="w-20 border border-gray-300 rounded px-2 py-1 disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500 text-sm">
            (min {minCols}, max {maxCols})
          </span>
        </label>
      </div>

      <div className="text-sm text-gray-600">
        OT znakov: {otChars.length} • ZT tokenov: {ztTokens.length} • Stĺpcov: {cols} • Riadkov: {rows}
      </div>

      <div className="overflow-auto border border-gray-200 rounded-lg p-2">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr>
              <th className="text-left px-2 py-1">#</th>
              <th className="text-left px-2 py-1">OT</th>
            </tr>
          </thead>
          <tbody>
            {otRows.map((r, i) => (
              <tr key={`ot-${i}`}>
                <td className="px-2 py-1 whitespace-nowrap align-top">{i + 1}</td>
                <td className="px-2 py-1">
                  {r.map((c) => (
                    <span key={c.id} className="inline-block min-w-[14px]">{c.ch || "·"}</span>
                  ))}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}>
                <hr className="border-t border-gray-300 my-2" />
              </td>
            </tr>
            {ztRows.map((r, i) => (
              <tr key={`zt-${i}`}>
                <td className="px-2 py-1 whitespace-nowrap align-top">{i + 1}</td>
                <td className="px-2 py-1">
                  {r.map((t) => (
                    <span key={t.id} className="inline-block min-w-[14px]">{t.text || "·"}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button
          onClick={emit}
          disabled={!canLoad}
          className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Pokračovať (vytvoriť grid)
        </button>
      </div>
    </div>
  );
};

export default FileLoader;
