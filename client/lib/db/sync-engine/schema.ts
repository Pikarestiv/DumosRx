import { query } from "../core";

// In-memory cache for table schemas to avoid redundant PRAGMA table_info queries
export const schemaCache: Record<string, Set<string>> = {};

/**
 * Retrieves and caches the valid columns for a given table.
 *
 * An empty result means the table does not exist locally: PRAGMA
 * table_info on an unknown table returns no rows rather than erroring.
 * That answer is deliberately never cached, so a table created by a
 * migration (or by a later initDatabase running SCHEMA_SQL) is picked up
 * instead of being treated as missing for the rest of the session.
 */
export async function getValidColumns(table: string): Promise<Set<string>> {
  const cached = schemaCache[table];
  if (cached) return cached;

  const tableInfo = await query<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  const columns = new Set(tableInfo.map((c) => c.name));
  if (columns.size > 0) {
    schemaCache[table] = columns;
  }
  return columns;
}

/**
 * Whether `table` exists in the local schema at all.
 */
export async function localTableExists(table: string): Promise<boolean> {
  return (await getValidColumns(table)).size > 0;
}
