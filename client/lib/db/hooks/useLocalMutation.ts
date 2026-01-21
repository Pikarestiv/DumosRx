/**
 * useLocalMutation - React hook for writing to local SQLite
 *
 * Provides optimistic writes that are queued for sync.
 */

"use client";

import { useState, useCallback } from "react";
import { insert, update, softDelete } from "../local-database";

export interface MutationOptions<TData, TResult> {
  /** Called on successful mutation */
  onSuccess?: (result: TResult, data: TData) => void;
  /** Called on error */
  onError?: (error: Error, data: TData) => void;
  /** Called after mutation (success or error) */
  onSettled?: () => void;
}

export interface UseMutationResult<TData, TResult> {
  mutate: (data: TData) => TResult | undefined;
  mutateAsync: (data: TData) => Promise<TResult>;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for inserting records into local SQLite
 */
export function useInsert<T extends Record<string, unknown>>(
  tableName: string,
  options: MutationOptions<T, string> = {},
): UseMutationResult<T, string> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(
    async (data: T): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const id = insert(tableName, data);
        options.onSuccess?.(id, data);
        return id;
      } catch (err) {
        const error = err as Error;
        setError(error);
        options.onError?.(error, data);
        throw error;
      } finally {
        setIsLoading(false);
        options.onSettled?.();
      }
    },
    [tableName, options],
  );

  const mutate = useCallback(
    (data: T): string | undefined => {
      try {
        return insert(tableName, data);
      } catch (err) {
        setError(err as Error);
        return undefined;
      }
    },
    [tableName],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, mutateAsync, isLoading, error, reset };
}

/**
 * Hook for updating records in local SQLite
 */
export function useUpdate<T extends Record<string, unknown>>(
  tableName: string,
  options: MutationOptions<{ id: string; data: T }, void> = {},
): UseMutationResult<{ id: string; data: T }, void> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(
    async ({ id, data }: { id: string; data: T }): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        update(tableName, id, data);
        options.onSuccess?.(undefined, { id, data });
      } catch (err) {
        const error = err as Error;
        setError(error);
        options.onError?.(error, { id, data });
        throw error;
      } finally {
        setIsLoading(false);
        options.onSettled?.();
      }
    },
    [tableName, options],
  );

  const mutate = useCallback(
    ({ id, data }: { id: string; data: T }): void => {
      try {
        update(tableName, id, data);
      } catch (err) {
        setError(err as Error);
      }
    },
    [tableName],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, mutateAsync, isLoading, error, reset };
}

/**
 * Hook for deleting records from local SQLite (soft delete)
 */
export function useDelete(
  tableName: string,
  options: MutationOptions<string, void> = {},
): UseMutationResult<string, void> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(
    async (id: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        softDelete(tableName, id);
        options.onSuccess?.(undefined, id);
      } catch (err) {
        const error = err as Error;
        setError(error);
        options.onError?.(error, id);
        throw error;
      } finally {
        setIsLoading(false);
        options.onSettled?.();
      }
    },
    [tableName, options],
  );

  const mutate = useCallback(
    (id: string): void => {
      try {
        softDelete(tableName, id);
      } catch (err) {
        setError(err as Error);
      }
    },
    [tableName],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, mutateAsync, isLoading, error, reset };
}
