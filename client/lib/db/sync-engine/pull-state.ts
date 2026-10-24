import { query } from "../core";
import { DUPLICATE_NAME_TABLES } from "../reconcile-identity";
import { STORAGE_KEYS, getStoredUser } from "@/lib/storage-keys";

// Safety bound only, not a correctness ceiling — every committed page
// persists its own keyset position. See docs/SYNC_PULL_PAGINATION.md.
export const MAX_PULL_PAGES = 1000;

// A UNIQUE collision isn't self-resolving, so give up eventually rather
// than stall the table's cursor. See client/AGENTS.md, "Pull details".
const MAX_UNIQUE_SKIP_RETRIES = 5;
const UNIQUE_SKIP_COUNTS_KEY = STORAGE_KEYS.syncUniqueSkipCounts;

function readSkipCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(UNIQUE_SKIP_COUNTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSkipCounts(counts: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UNIQUE_SKIP_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // Best-effort; a failed write only resets this record's retry count.
  }
}

// Whether this pull's `stores` response can be read as a snapshot of every store the ACCOUNT owns — the premise the prune below rests on.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-pull-ts-L48
export function storesSnapshotIsAccountWide(): boolean {
  return !getStoredUser()?.store_id;
}

export function recordUniqueSkipAndCheckGiveUp(table: string, recordId: string): boolean {
  const key = `${table}:${recordId}`;
  const counts = readSkipCounts();
  const nextCount = (counts[key] ?? 0) + 1;
  counts[key] = nextCount;
  writeSkipCounts(counts);
  return nextCount > MAX_UNIQUE_SKIP_RETRIES;
}

// Decides only when `onCriticalTablesReady` fires, not what's fetched.
export const SETUP_CRITICAL_TABLES = ["stores", "users"];

// Columns each device owns privately:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-pull-ts-L70
export const DEVICE_LOCAL_PULL_COLUMNS: Record<string, readonly string[]> = {
  stores: ["last_monotonic_time"],
};

export interface PullPageCursor {
  updated_at: string;
  id: string;
}

// Upserts one column without disturbing the other; the two cursors advance
// on different schedules (docs/SYNC_PULL_PAGINATION.md).
export const PULL_PROGRESS = {
  savePosition:
    `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor) VALUES (?, ?, NULL, ?)
     ON CONFLICT(store_id, table_name) DO UPDATE SET server_cursor = excluded.server_cursor`,
  completeWindow:
    `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor) VALUES (?, ?, ?, NULL)
     ON CONFLICT(store_id, table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at, server_cursor = NULL,
       rewind_count = 0, rewound_from = NULL`,
} as const;

export function parsePullPageCursor(raw: string | null | undefined): PullPageCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.updated_at === "string" && typeof parsed.id === "string") {
      return parsed;
    }
  } catch {
    // A corrupt cursor just re-pages the window, which is idempotent.
  }
  return null;
}

export function cursorForLastRecord(records: Record<string, unknown>[]): PullPageCursor | null {
  const last = records[records.length - 1];
  if (!last || typeof last.updated_at !== "string" || last.id == null) return null;
  return { updated_at: last.updated_at, id: String(last.id) };
}

export async function readPullStartState(windowStoreId: string): Promise<{
  lastSyncedMap: Record<string, string>;
  pageCursors: Record<string, PullPageCursor>;
}> {
  const syncState = await query<{
    table_name: string;
    last_synced_at: string;
    server_cursor: string | null;
  }>("SELECT table_name, last_synced_at, server_cursor FROM _sync_state WHERE store_id = ?", [
    windowStoreId,
  ]);

  // DUPLICATE_NAME_TABLES and still-NULL windows are deliberately left
  // out of the cursor map — see client/AGENTS.md, "Pull details".
  const lastSyncedMap = syncState.reduce(
    (acc, row) => {
      if (!(row.table_name in DUPLICATE_NAME_TABLES) && row.last_synced_at) {
        acc[row.table_name] = row.last_synced_at;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  // Where the last round got to inside each table's undrained window; a
  // drained table has none, so it starts from the window boundary.
  const pageCursors = syncState.reduce(
    (acc, row) => {
      const cursor = parsePullPageCursor(row.server_cursor);
      if (cursor && !(row.table_name in DUPLICATE_NAME_TABLES)) {
        acc[row.table_name] = cursor;
      }
      return acc;
    },
    {} as Record<string, PullPageCursor>
  );

  return { lastSyncedMap, pageCursors };
}
