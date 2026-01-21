/**
 * useLocalData - React hook for reading from local SQLite
 *
 * Provides instant reads from local database with optional live updates.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { initDatabase, query } from "../local-database";

export interface UseLocalDataOptions<T> {
  /** Initial data while loading */
  initialData?: T[];
  /** Transform function for each row */
  transform?: (row: Record<string, unknown>) => T;
  /** Refresh interval in ms (0 = no auto-refresh) */
  refreshInterval?: number;
}

export interface UseLocalDataResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for querying local SQLite database
 *
 * @example
 * const { data: medicines, loading } = useLocalData<Medicine>(
 *   'SELECT * FROM medicines WHERE _deleted = 0',
 *   [],
 *   { transform: transformMedicine }
 * );
 */
export function useLocalData<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
  options: UseLocalDataOptions<T> = {},
): UseLocalDataResult<T> {
  const { initialData = [], transform, refreshInterval = 0 } = options;

  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dbReady, setDbReady] = useState(false);

  // Use ref for transform to avoid infinite loops if inline function is passed
  const transformRef = useRef(transform);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Initialize database
  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => setError(err));
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!dbReady) return;

    try {
      setLoading(true);
      const results = query<Record<string, unknown>>(sql, params);
      const currentTransform = transformRef.current;

      const transformed = currentTransform
        ? results.map(currentTransform)
        : (results as unknown as T[]);
      setData(transformed);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [sql, JSON.stringify(params), dbReady]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Convenience hook for fetching all records from a table
 */
export function useTable<T = Record<string, unknown>>(
  tableName: string,
  options: UseLocalDataOptions<T> & {
    where?: string;
    orderBy?: string;
  } = {},
): UseLocalDataResult<T> {
  const {
    where = "_deleted = 0",
    orderBy = "created_at DESC",
    ...rest
  } = options;

  const sql = `SELECT * FROM ${tableName} WHERE ${where} ORDER BY ${orderBy}`;
  return useLocalData<T>(sql, [], rest);
}
