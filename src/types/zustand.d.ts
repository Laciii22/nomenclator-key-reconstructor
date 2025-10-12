declare module 'zustand' {
  // Minimal type shim to satisfy TS in strict + bundler mode
  export function create<TState>(
    initializer: (set: (fn: (state: TState) => Partial<TState> | TState) => void, get: () => TState) => TState
  ): (selector?: (s: TState) => any) => any;
}
