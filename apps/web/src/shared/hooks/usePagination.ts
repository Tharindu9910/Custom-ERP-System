import { useState } from 'react';

interface PaginationReturn {
  page: number;
  limit: number;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;
}

export function usePagination(initialLimit = 20): PaginationReturn {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);

  return {
    page,
    limit,
    setPage,
    setLimit: (l) => {
      setLimit(l);
      setPage(1);
    },
    nextPage: () => setPage((p) => p + 1),
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    resetPage: () => setPage(1),
  };
}