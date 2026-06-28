import { useCallback, useRef } from 'react';

export function usePrint() {
  const printRef = useRef<HTMLDivElement>(null);

  const print = useCallback(() => {
    window.print();
  }, []);

  return { printRef, print };
}