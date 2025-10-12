import { create } from 'zustand';

export type OTChar = { id: string; ch: string };
export type ZTToken = { id: string; text: string; locked?: boolean };

export type GridState = {
  otRaw: string;
  ztRaw: string;
  otChars: OTChar[];
  ztTokens: ZTToken[];
  cols: number;
  rows: number;
  otRows: OTChar[][];
  ztRows: ZTToken[][];
};

type CipherStore = {
  grid: GridState | null;
  history: GridState[];
  future: GridState[];
  loadGrid: (g: GridState) => void;
  setCols: (cols: number) => void;
  undo: () => void;
  redo: () => void;
  exportJSON: () => string | null;
};

export const useCipherStore = create<CipherStore>((set: (fn: (s: CipherStore) => Partial<CipherStore> | CipherStore) => void, get: () => CipherStore) => ({
  grid: null,
  history: [],
  future: [],
  loadGrid: (g: GridState) => set((s: CipherStore) => ({ history: s.grid ? [...s.history, s.grid] : s.history, future: [], grid: g })),
  setCols: (cols: number) => set((s: CipherStore) => {
    if (!s.grid) return {} as any;
    const g = s.grid;
    // basic recompute rows with padding (simple placeholder; replace with real logic)
    const rows = Math.max(
      Math.ceil((g.otChars.length || 1) / cols),
      Math.ceil((g.ztTokens.length || 1) / cols)
    );
    const chunk = <T,>(arr: T[]) => {
      const out: T[][] = [];
      for (let r = 0; r < rows; r++) {
        const start = r * cols;
        const slice = arr.slice(start, start + cols) as any[];
        while (slice.length < cols) slice.push({ ...(Array.isArray(arr) && typeof arr[0] === 'object' ? {} : { }) } as any);
        out.push(slice as T[]);
      }
      return out;
    };
  const otRows = chunk(g.otChars.map((c: OTChar) => ({ ...c })));
  const ztRows = chunk(g.ztTokens.map((t: ZTToken) => ({ ...t })));
    const newGrid: GridState = { ...g, cols, rows, otRows, ztRows };
    return { history: g ? [...s.history, g] : s.history, future: [], grid: newGrid };
  }),
  undo: () => set((s: CipherStore) => {
    const prev = s.history[s.history.length - 1];
    if (!prev) return s;
    const history = s.history.slice(0, -1);
    const future = s.grid ? [s.grid, ...s.future] : s.future;
    return { grid: prev, history, future };
  }),
  redo: () => set((s: CipherStore) => {
    const next = s.future[0];
    if (!next) return s;
    const future = s.future.slice(1);
    const history = s.grid ? [...s.history, s.grid] : s.history;
    return { grid: next, history, future };
  }),
  exportJSON: () => {
    const g = get().grid;
    return g ? JSON.stringify(g, null, 2) : null;
  },
}));
