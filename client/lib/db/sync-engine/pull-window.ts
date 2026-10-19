import { execute, query } from "../core";
import { logCrash } from "@/lib/utils/error-logger";

/**
 * Consecutive full-table rewinds allowed before a table's baseline is put
 * back and the device reports instead of grinding. Reset to zero whenever
 * the table drains skip-free (PULL_PROGRESS.completeWindow), so this only
 * bites a table that genuinely cannot re-stamp its window. Rationale and
 * the A-218/A-229 failure paths: client/AGENTS.md, "Pull window rewinds".
 */
export const MAX_PULL_WINDOW_REWINDS = 3;

/**
 * Tables the server never sends, so a pull window for them is meaningless.
 * `feedback` is the crash log: write-only telemetry, absent from pull()'s
 * table list, so its window can never drain clean and can never have its
 * rewind budget refreshed by `completeWindow`. Left in place it reports
 * "budget still exhausted" on every round for ever - and each report is
 * itself a crash log, which is the row that keeps the condition alive. See
 * docs/FIXED_BUGS.md A-256.
 */
export const TABLES_NEVER_PULLED = new Set(["feedback"]);

const REWIND_SQL = `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor, rewind_count, rewound_from)
   VALUES (?, ?, NULL, NULL, 1, NULL)
   ON CONFLICT(store_id, table_name) DO UPDATE SET
     rewound_from = COALESCE(rewound_from, last_synced_at),
     last_synced_at = NULL,
     server_cursor = NULL,
     rewind_count = rewind_count + 1`;

const RESTORE_SQL = `UPDATE _sync_state
   SET last_synced_at = COALESCE(rewound_from, last_synced_at), rewound_from = NULL, server_cursor = NULL
   WHERE store_id = ? AND table_name = ?`;

const STAMP_SQL = `INSERT INTO _sync_state (store_id, table_name, last_synced_at) VALUES (?, ?, ?)
   ON CONFLICT(store_id, table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at
   WHERE rewind_count = 0`;

/**
 * The only way a caller outside this module may advance a pull window. It
 * names the one column it owns — an INSERT OR REPLACE reverted the rewind
 * bookkeeping to its schema defaults (A-228) — and refuses to stamp over a
 * rewind in flight, because a newer stamp cancels the re-pull.
 */
export async function stampPullWindowUnlessRewinding(
  storeId: string,
  table: string,
  syncedAt: string,
): Promise<void> {
  await execute(STAMP_SQL, [storeId, table, syncedAt]);
}

const EXHAUSTED_SQL = `SELECT table_name FROM _sync_state WHERE store_id = ? AND rewind_count >= ?`;

async function restoreBaseline(storeId: string, table: string, cause: string): Promise<void> {
  await execute(RESTORE_SQL, [storeId, table]);
  await logCrash(
    new Error(
      `Pull window rewind budget (${MAX_PULL_WINDOW_REWINDS}) spent on ${table} by refused re-pushes (${cause}); baseline restored and the incremental pull continues, so this table stops asking for a full re-pull until it drains skip-free`,
    ),
    false,
    { area: "sync-pull-window", table },
  );
}

/**
 * Runs at the start of every pull round, unconditionally: the budget is spent
 * by live faults, but the fault may never fire again, and until this ran only
 * inside rewindPullWindow() such a table kept a null window for ever. See
 * client/AGENTS.md, "Pull window rewinds".
 */
export async function restoreExhaustedPullWindows(storeId: string): Promise<string[]> {
  const exhausted = await query<{ table_name: string }>(EXHAUSTED_SQL, [
    storeId,
    MAX_PULL_WINDOW_REWINDS,
  ]);

  const restored: string[] = [];

  for (const { table_name } of exhausted) {
    // Nothing to restore a baseline for, and reporting it would write the
    // very row that caused the exhaustion. Drop the row instead, which also
    // heals a device already stuck in that loop.
    if (TABLES_NEVER_PULLED.has(table_name)) {
      await execute("DELETE FROM _sync_state WHERE store_id = ? AND table_name = ?", [
        storeId,
        table_name,
      ]);
      continue;
    }

    await restoreBaseline(storeId, table_name, "budget still exhausted");
    restored.push(table_name);
  }

  return restored;
}

export interface StashedPullWindow {
  table_name: string;
  last_synced_at: string | null;
  server_cursor: string | null;
  rewind_count: number | null;
  rewound_from: string | null;
}

/**
 * Empties every pull window and hands back what it removed, so a full resync
 * that never commits a page can be undone. See A-243 in docs/FIXED_BUGS.md.
 */
export async function clearPullWindows(storeId: string): Promise<StashedPullWindow[]> {
  const stashed = await query<StashedPullWindow>(
    "SELECT table_name, last_synced_at, server_cursor, rewind_count, rewound_from FROM _sync_state WHERE store_id = ?",
    [storeId],
  );
  await execute("DELETE FROM _sync_state WHERE store_id = ?", [storeId]);
  return stashed;
}

/**
 * Restores a stash, but only while `_sync_state` is still empty: any row means
 * the resync committed a page, so its fresh positions must win. Returns
 * whether it restored anything.
 */
export async function restorePullWindows(
  storeId: string,
  stashed: StashedPullWindow[],
): Promise<boolean> {
  if (stashed.length === 0) return false;

  const [current] = await query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM _sync_state WHERE store_id = ?",
    [storeId],
  );
  if (Number(current?.count ?? 0) > 0) return false;

  for (const row of stashed) {
    await execute(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor, rewind_count, rewound_from)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        row.table_name,
        row.last_synced_at,
        row.server_cursor,
        row.rewind_count ?? 0,
        row.rewound_from,
      ],
    );
  }

  return true;
}

/**
 * shortcut: rewinds the whole table's window rather than re-requesting the
 * one row, because the sync API has no by-id re-send endpoint. Upgrade to a
 * targeted request when one exists — A-176 needs the same endpoint, and it
 * would remove the need for this budget entirely.
 */
export async function rewindPullWindow(
  storeId: string,
  table: string,
  cause: string,
): Promise<boolean> {
  const [state] = await query<{ rewind_count: number | null; rewound_from: string | null }>(
    "SELECT rewind_count, rewound_from FROM _sync_state WHERE store_id = ? AND table_name = ?",
    [storeId, table],
  );

  if ((state?.rewind_count ?? 0) >= MAX_PULL_WINDOW_REWINDS) {
    await restoreBaseline(storeId, table, cause);
    return false;
  }

  await execute(REWIND_SQL, [storeId, table]);
  return true;
}
