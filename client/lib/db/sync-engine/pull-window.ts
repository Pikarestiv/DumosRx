import { execute, query } from "../core";
import { logCrash } from "@/lib/utils/error-logger";

/**
 * Consecutive full-table rewinds allowed before a table's baseline is put
 * back and the device reports instead of grinding. Reset to zero whenever
 * the table drains skip-free (PULL_PROGRESS.completeWindow), so this only
 * bites a table that genuinely cannot re-stamp its window. Rationale and
 * the A-218 failure path: client/AGENTS.md, "Pull window rewinds".
 */
export const MAX_PULL_WINDOW_REWINDS = 3;

const REWIND_SQL = `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor, rewind_count, rewound_from)
   VALUES (?, NULL, NULL, 1, NULL)
   ON CONFLICT(table_name) DO UPDATE SET
     rewound_from = COALESCE(rewound_from, last_synced_at),
     last_synced_at = NULL,
     server_cursor = NULL,
     rewind_count = rewind_count + 1`;

const RESTORE_SQL = `UPDATE _sync_state
   SET last_synced_at = rewound_from, rewound_from = NULL, server_cursor = NULL
   WHERE table_name = ? AND rewound_from IS NOT NULL`;

/**
 * shortcut: rewinds the whole table's window rather than re-requesting the
 * one row, because the sync API has no by-id re-send endpoint. Upgrade to a
 * targeted request when one exists — A-176 needs the same endpoint, and it
 * would remove the need for this budget entirely.
 */
export async function rewindPullWindow(table: string, cause: string): Promise<boolean> {
  const [state] = await query<{ rewind_count: number | null; rewound_from: string | null }>(
    "SELECT rewind_count, rewound_from FROM _sync_state WHERE table_name = ?",
    [table],
  );

  if ((state?.rewind_count ?? 0) >= MAX_PULL_WINDOW_REWINDS) {
    if (state?.rewound_from) {
      await execute(RESTORE_SQL, [table]);
      logCrash(
        new Error(
          `Pull window rewind budget exhausted for ${table} (${cause}); baseline restored, this device cannot converge on its own`,
        ),
        false,
        { area: "sync-pull-window", table },
      );
    }
    return false;
  }

  await execute(REWIND_SQL, [table]);
  return true;
}
