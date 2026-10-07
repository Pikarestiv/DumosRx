"use client";

import { useEffect, useRef, useState } from "react";

export function useResettingPage(resetKey: unknown): [number, (page: number) => void] {
  const [page, setPage] = useState(1);
  const previous = useRef(resetKey);

  useEffect(() => {
    if (previous.current !== resetKey) {
      previous.current = resetKey;
      setPage(1);
    }
  }, [resetKey]);

  return [page, setPage];
}
