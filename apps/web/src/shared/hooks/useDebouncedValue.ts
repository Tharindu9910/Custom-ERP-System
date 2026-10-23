import { useEffect, useState } from 'react';

/**
 * `value`, updated only once it has stopped changing for `delay` ms. Search boxes
 * pass this to their query so a typed search costs one request, not one per key.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}
