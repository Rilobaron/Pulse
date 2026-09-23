import { useEffect, useState } from 'react';

/**
 * Forces a re-render on a fixed interval so relative timestamps ("4 minutes
 * ago") keep advancing without polling the API. The returned value is unused on
 * purpose — the re-render is the effect.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
