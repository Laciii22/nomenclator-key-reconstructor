import * as React from 'react';

export function useBusyState(params: {
  minBusyMs?: number;
}) {
  const { minBusyMs = 220 } = params;

  const [isGridBusy, setIsGridBusy] = React.useState(false);
  const [isAppBusy, setIsAppBusy] = React.useState(false);
  const [appBusyLabel, setAppBusyLabel] = React.useState<string | null>(null);

  const gridBusyClearRafRef = React.useRef<number | null>(null);
  const appBusyClearRafRef = React.useRef<number | null>(null);
  const appBusyClearTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (gridBusyClearRafRef.current !== null) {
        window.cancelAnimationFrame(gridBusyClearRafRef.current);
      }
      if (appBusyClearRafRef.current !== null) {
        window.cancelAnimationFrame(appBusyClearRafRef.current);
      }
      if (appBusyClearTimeoutRef.current !== null) {
        window.clearTimeout(appBusyClearTimeoutRef.current);
      }
    };
  }, []);

  const scheduleGridBusyClear = React.useCallback(() => {
    if (gridBusyClearRafRef.current !== null) {
      window.cancelAnimationFrame(gridBusyClearRafRef.current);
    }
    gridBusyClearRafRef.current = window.requestAnimationFrame(() => {
      setIsGridBusy(false);
      gridBusyClearRafRef.current = null;
    });
  }, []);

  const runWithGridBusy = React.useCallback((operation: () => void) => {
    setIsGridBusy(true);
    window.requestAnimationFrame(() => {
      try {
        operation();
      } finally {
        scheduleGridBusyClear();
      }
    });
  }, [scheduleGridBusyClear]);

  const scheduleAppBusyClear = React.useCallback((delayMs = 0) => {
    if (appBusyClearRafRef.current !== null) {
      window.cancelAnimationFrame(appBusyClearRafRef.current);
    }
    if (appBusyClearTimeoutRef.current !== null) {
      window.clearTimeout(appBusyClearTimeoutRef.current);
    }
    appBusyClearRafRef.current = window.requestAnimationFrame(() => {
      appBusyClearTimeoutRef.current = window.setTimeout(() => {
        setIsAppBusy(false);
        setAppBusyLabel(null);
        appBusyClearTimeoutRef.current = null;
      }, Math.max(0, delayMs));
      appBusyClearRafRef.current = null;
    });
  }, []);

  const runWithAppBusy = React.useCallback((label: string, operation: () => void) => {
    setIsAppBusy(true);
    setAppBusyLabel(label);
    window.requestAnimationFrame(() => {
      // Ensure busy indicator gets painted before heavy work starts.
      window.requestAnimationFrame(() => {
        const startedAt = performance.now();
        try {
          operation();
        } finally {
          const elapsed = performance.now() - startedAt;
          scheduleAppBusyClear(Math.max(0, minBusyMs - elapsed));
        }
      });
    });
  }, [minBusyMs, scheduleAppBusyClear]);

  return {
    isGridBusy,
    isAppBusy,
    appBusyLabel,
    runWithGridBusy,
    runWithAppBusy,
    setAppBusyLabel,
  } as const;
}
