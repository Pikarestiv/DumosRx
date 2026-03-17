/**
 * Base CRUD Helpers
 */

import { execute, query, generateId, logAction } from "./core";

export async function insert(table: string, data: Record<string, unknown>): Promise<string> {
  const id = (data.id as string) || generateId();
  const now = new Date().toISOString();

  const record: Record<string, unknown> = {
    ...data,
    id,
    created_at: data.created_at || now,
    updated_at: now,
    _version: 1,
    _synced: 0,
  };

  const columns = Object.keys(record);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((col) => record[col]) as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  await execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );

  await addToSyncQueue(table, id, "INSERT", record);
  await logAction("INSERT", table, id, record);

  return id;
}

export async function update(
  table: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  const current = await query<{ _version: number }>(
    `SELECT _version FROM ${table} WHERE id = ?`,
    [id],
  );
  const version = current[0]?._version || 0;

  const record = {
    ...data,
    updated_at: now,
    _version: version + 1,
    _synced: 0,
  };

  const setClause = Object.keys(record)
    .map((col) => `${col} = ?`)
    .join(", ");
  const values = [...Object.values(record), id] as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  await execute(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);

  await addToSyncQueue(table, id, "UPDATE", record);
  await logAction("UPDATE", table, id, record);
}

export async function softDelete(table: string, id: string): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0 WHERE id = ?`,
    [now, id],
  );

  await addToSyncQueue(table, id, "DELETE", { id });
  await logAction("DELETE", table, id, { id });
}

async function addToSyncQueue(
  table: string,
  recordId: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [table, recordId, operation, JSON.stringify(payload), now],
  );
}

export async function getPendingSyncItems() {
  return await query<any>("SELECT * FROM _sync_queue ORDER BY created_at ASC");
}

export async function markSynced(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) return;
  const placeholders = queueIds.map(() => "?").join(", ");
  await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, queueIds);
}
