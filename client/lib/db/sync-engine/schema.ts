import { query } from "../core";

// In-memory cache for table schemas to avoid redundant PRAGMA table_info queries
export const schemaCache: Record<string, Set<string>> = {};

/**
 * Retrieves and caches the valid columns for a given table.
 */
export async function getValidColumns(table: string): Promise<Set<string>> {
  if (!schemaCache[table]) {
    const tableInfo = await query<{ name: string }>(
      `PRAGMA table_info(${table})`
    );
    schemaCache[table] = new Set(tableInfo.map((c) => c.name));
  }
  return schemaCache[table];
}
