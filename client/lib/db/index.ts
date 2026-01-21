/**
 * Database hooks for local-first data access
 */

export { initDatabase, isTauri, generateId } from "./local-database";
export { query, execute, insert, update, softDelete } from "./local-database";
export {
  getPendingSyncItems,
  markSynced,
  getDatabase,
  saveDatabase,
} from "./local-database";

// React hooks
export * from "./hooks";
