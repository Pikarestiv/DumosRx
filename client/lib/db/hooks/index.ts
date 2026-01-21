/**
 * Database hooks for local-first data access
 */

export { useLocalData, useTable } from "./useLocalData";
export type { UseLocalDataOptions, UseLocalDataResult } from "./useLocalData";

export { useInsert, useUpdate, useDelete } from "./useLocalMutation";
export type { MutationOptions, UseMutationResult } from "./useLocalMutation";
