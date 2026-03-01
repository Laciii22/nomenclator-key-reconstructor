import { useEffect, useState } from 'react';

/**
 * Returns the current `window.innerWidth`, updated with a debounce on resize.
 *
 * Extracted from useNomenklator so the resize listener lifecycle is isolated,
 * testable (SSR-safe: returns 1200 when `window` is undefined), and reusable.
 *
 * @param delayMs - Debounce delay in milliseconds (default: 150)
 */
export function useViewportWidth(delayMs = 150): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1200 : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const onResize = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWidth(window.innerWidth);
      }, delayMs);
    };

    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      window.removeEventListener('resize', onResize);
    };
  }, [delayMs]);

  return width;
}
