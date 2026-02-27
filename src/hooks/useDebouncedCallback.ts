import * as React from 'react';

/**
 * Returns a debounced version of a callback that delays invocation until
 * after `delayMs` have elapsed since the last call.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number
) {
  const callbackRef = React.useRef(callback);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = React.useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => cancel, [cancel]);

  const debounced = React.useCallback(
    (...args: TArgs) => {
      cancel();
      timerRef.current = window.setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs]
  );

  return { debounced, cancel } as const;
}
