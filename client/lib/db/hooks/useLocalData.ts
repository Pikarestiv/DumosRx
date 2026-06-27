/**
 * useLocalData - React hook for reading from local SQLite
 *
 * Provides instant reads from local database with optional live updates.
 */

"use client";


import { useQuery } from "@tanstack/react-query";
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['localData', sql, params],
    queryFn: async () => {
      await initDatabase(); // Ensure DB is initialized before querying
      const results = await query<Record<string, unknown>>(sql, params);
      if (transform) {
        return results.map(transform);
      }
      return results as unknown as T[];
    },
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  });

  return { 
    data: data || initialData, 
    loading: isLoading, 
    error: error as Error | null, 
    refetch: async () => { await refetch(); } 
  };
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
