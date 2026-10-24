"use client";

import { useState } from "react";

export function useResettingPage(resetKey: unknown): [number, (page: number) => void] {
  const [page, setPage] = useState(1);
  const [previousKey, setPreviousKey] = useState(resetKey);

  if (previousKey !== resetKey) {
    setPreviousKey(resetKey);
    setPage(1);
  }

  return [page, setPage];
}
