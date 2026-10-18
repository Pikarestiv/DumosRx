import { query, getActiveStoreId } from "../core";
import { STORE_SCOPED_TABLES } from "../schema-migrations";

/**
 * One table's digest. Short keys because this rides on every eligible push
 * and 26 tables of long keys is most of a kilobyte of nothing.
 *
 * `t` table, `r` rows, `v` sum of `_version`, `p` unpushed queue rows.
 */
export interface TableDigest {
  t: string;
  r: number;
  v: number;
  p: number;
}

export interface TableFingerprint {
  tables: TableDigest[];
}

/**
 * Scanning 26 tables is not free on a mid-range phone, and an auto-sync runs
 * every few minutes. Rationale and the measured cost: docs/DEVICE_TABLE_AGREEMENT.md.
 */
const THROTTLE_MS = 15 * 60_000;

let lastBuiltAt = 0;

export function resetTableFingerprintThrottleForTesting(): void {
  lastBuiltAt = 0;
}

async function pendingByTable(): Promise<Map<string, number>> {
  const rows = await query<{ table_name: string; count: number }>(
    "SELECT table_name, COUNT(*) AS count FROM _sync_queue GROUP BY table_name",
  );

  return new Map(rows.map((row) => [row.table_name, Number(row.count ?? 0)]));
}

async function digestFor(
  table: string,
  storeId: string,
  pending: number,
): Promise<TableDigest | null> {
  try {
    const rows = await query<{ r: number; v: number | null }>(
      `SELECT COUNT(*) AS r, COALESCE(SUM(_version), 0) AS v
       FROM ${table} WHERE store_id = ?`,
      [storeId],
    );

    return { t: table, r: Number(rows[0]?.r ?? 0), v: Number(rows[0]?.v ?? 0), p: pending };
  } catch {
    // A device whose schema migration has not yet added a column must still
    // report every other table rather than nothing.
    return null;
  }
}

/**
 * What this device holds, per synced table: how many rows and the sum of
 * their `_version`. The server compares each against the rows a pull would
 * send the same device, so a table that has silently stopped agreeing is
 * visible without anyone reading code.
 *
 * Soft-deleted rows are counted: the device keeps them with `_deleted = 1`
 * and the server keeps them with `deleted_at` set, so excluding them here
 * would read as a divergence on every store — and a server that HARD-deletes
 * where the device soft-deletes is exactly the bug class this detects.
 *
 * Returns null when there is nothing to say, which is also what the throttle
 * window returns: a report is only ever sent in the push that computed it,
 * so the server never compares a stale device reading against a live cloud.
 */
export async function buildTableFingerprint(): Promise<TableFingerprint | null> {
  const storeId = getActiveStoreId();

  if (!storeId || Date.now() - lastBuiltAt < THROTTLE_MS) {
    return null;
  }

  try {
    const pending = await pendingByTable();
    const tables: TableDigest[] = [];

    for (const table of STORE_SCOPED_TABLES) {
      const digest = await digestFor(table, storeId, pending.get(table) ?? 0);

      if (digest) {
        tables.push(digest);
      }
    }

    if (tables.length === 0) {
      return null;
    }

    lastBuiltAt = Date.now();

    return { tables };
  } catch (err) {
    // Reporting must never be able to fail a sync.
    console.warn("[Sync] Could not build table fingerprint", err);
    return null;
  }
}
