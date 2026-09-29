import { query, execute, transaction, STORE_SCOPED_TABLES } from "../core";
import { apiClient } from "@/lib/api/client";
import { PullResponse } from "./types";
import { getValidColumns } from "./schema";
import { remapForeignKey, DUPLICATE_NAME_TABLES, columnExists } from "../reconcile-identity";
import { logCrash } from "@/lib/utils/error-logger";
import { STORAGE_KEYS, getStoredUser } from "@/lib/storage-keys";

// Safety bound on the page loop below: it stops one sync() call running
// forever if a server bug ever reports has_more=true indefinitely. It is no
// longer a correctness ceiling — every committed page persists its own keyset
// position (see PULL_PROGRESS below), so a round that stops here resumes from
// exactly where it left off on the next sync() instead of restarting the
// window. See docs/SYNC_PULL_PAGINATION.md.
const MAX_PULL_PAGES = 1000;

// A UNIQUE-constraint collision on a pulled record (e.g. two accounts
// independently created a user with the same email) is not self-resolving
// the way a pending-local-edit skip is — nothing about a future pull changes
// the collision. Blocking that table's cursor on it forever would silently
// stall every OTHER record in the table too. Cap how many separate pulls are
// allowed to retry the same record before giving up and letting the cursor
// advance past it anyway (the record stays in skippedRecords/logCrash either
// way, so the loss is visible, not silent).
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
    // Best-effort persistence; a failed write just means this record's
    // retry count resets, which only makes the fix more conservative.
  }
}

// Returns true once this record has exceeded the retry cap and the table
// cursor should be allowed to advance past it despite the collision.
/**
 * Whether this pull's `stores` response can be read as a snapshot of every
 * store the ACCOUNT owns, which is the whole premise the prune below rests
 * on. It cannot when the signed-in identity is a staff account:
 * `SyncController::resolvePullTenantScope()` resolves `$ownedStoreIds` to
 * `[$user->store_id]` for any user carrying one, so the response is a
 * one-store list by design, not a statement that the account's other stores
 * are gone. See client/AGENTS.md, "The `stores` prune and how a store
 * disappears".
 */
function storesSnapshotIsAccountWide(): boolean {
  return !getStoredUser()?.store_id;
}

function recordUniqueSkipAndCheckGiveUp(table: string, recordId: string): boolean {
  const key = `${table}:${recordId}`;
  const counts = readSkipCounts();
  const nextCount = (counts[key] ?? 0) + 1;
  counts[key] = nextCount;
  writeSkipCounts(counts);
  return nextCount > MAX_UNIQUE_SKIP_RETRIES;
}

// Enough to log in and land on the dashboard: store identity plus who can
// authenticate. Everything else (products, stock_batches, sales, ...)
// still gets pulled in the SAME call, on the SAME page loop below - this
// only decides when `onCriticalTablesReady` fires, not what's fetched.
const SETUP_CRITICAL_TABLES = ["stores", "users"];

/**
 * Columns each device owns privately: written locally, never pushed, so the
 * server's copy of them is meaningless and must never be written back.
 * Applied exactly like the stock_batches.quantity exclusion further down —
 * the rest of the pulled row still applies, only these columns are dropped.
 *
 * stores.last_monotonic_time is the anchor for the offline clock-tamper
 * guard (lib/licensing/licensing-manager.ts refuses a local time earlier
 * than the last recorded action). Only updateStoreMonotonicTime()
 * (lib/db/queries/setup.ts) writes it, as a raw local `execute` that never
 * reaches _sync_queue, so the server's column is permanently NULL. Writing
 * that NULL back disarmed the guard after every sync round; and were the
 * column ever pushed (window.forceSyncAllData queues whole `stores` rows),
 * a device with a fast clock would propagate a future timestamp to every
 * other device of the store and lock them all out.
 */
const DEVICE_LOCAL_PULL_COLUMNS: Record<string, readonly string[]> = {
  stores: ["last_monotonic_time"],
};

interface PullPageCursor {
  updated_at: string;
  id: string;
}

// Upserts one column without disturbing the other: last_synced_at is the
// delta window, server_cursor the position reached inside it. They advance on
// different schedules — see docs/SYNC_PULL_PAGINATION.md.
const PULL_PROGRESS = {
  savePosition:
    `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor) VALUES (?, NULL, ?)
     ON CONFLICT(table_name) DO UPDATE SET server_cursor = excluded.server_cursor`,
  completeWindow:
    `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor) VALUES (?, ?, NULL)
     ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at, server_cursor = NULL`,
} as const;

function parsePullPageCursor(raw: string | null | undefined): PullPageCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.updated_at === "string" && typeof parsed.id === "string") {
      return parsed;
    }
  } catch {
    // A corrupt cursor just means this table pages from the window start
    // again, which is idempotent — never a reason to fail the whole pull.
  }
  return null;
}

function cursorForLastRecord(records: Record<string, unknown>[]): PullPageCursor | null {
  const last = records[records.length - 1];
  if (!last || typeof last.updated_at !== "string" || last.id == null) return null;
  return { updated_at: last.updated_at, id: String(last.id) };
}

/**
 * Pull changes from server
 *
 * `onCriticalTablesReady`, when passed, fires once — the first time every
 * table in SETUP_CRITICAL_TABLES has fully drained its backlog for this
 * round (or, as a fallback, once at the very end if that never happened
 * mid-loop, e.g. an account with zero staff/store changes this round) —
 * so a caller mid-first-sync (see startSyncProcess in use-onboarding.ts)
 * can let the user log in and land on the dashboard as soon as identity
 * data is in place, while this same call keeps running underneath to pull
 * everything else. Never fires more than once. No-op for a normal
 * (non-setup) pull that doesn't pass it.
 *
 * It is always passed whether the pull it is reporting on actually
 * succeeded. A pull that threw still fires it (so a caller awaiting the
 * signal is never left hanging) but fires it with `false`: the page
 * transaction that carries stores and users rolls back as a unit, so on a
 * failure nothing was written and there is no identity to move on with.
 */
export async function pullChanges(
  isManual: boolean = false,
  isSetup: boolean = false,
  onCriticalTablesReady?: (pullSucceeded: boolean) => void,
  // Marks every page below as part of the same sync run as the push that
  // preceded it, so the server's plan-tier sync-interval throttle doesn't
  // reject this run's own later requests (see push.ts's own runId note).
  runId?: string,
): Promise<{
  pulled: number;
  updatedTables?: string[];
  error?: unknown;
}> {
  const criticalTablesPending = new Set(SETUP_CRITICAL_TABLES);
  let criticalReadyFired = false;
  let pullFailed = false;
  const fireCriticalReadyOnce = (pullSucceeded: boolean) => {
    if (criticalReadyFired) return;
    criticalReadyFired = true;
    onCriticalTablesReady?.(pullSucceeded);
  };

  try {
    // Get last sync timestamp for each table
    const syncState = await query<{
      table_name: string;
      last_synced_at: string;
      server_cursor: string | null;
    }>("SELECT table_name, last_synced_at, server_cursor FROM _sync_state");

    // Map to object { table: timestamp }. Tables in DUPLICATE_NAME_TABLES
    // (categories, suppliers) are deliberately never given a cursor here: the
    // server's pull() treats a table missing from last_synced as "return
    // everything" (see SyncController::pull), and the duplicate-name
    // reconciliation below can only fix a collision if the pre-existing row
    // it collided with is actually present in this response. A normal delta
    // pull (updated_at > last_synced) would never re-surface a long-unchanged
    // row like "DRUGS", permanently hiding the collision from every future
    // sync. Categories/suppliers are small collections by nature — tens,
    // rarely hundreds — so always fetching them in full costs nothing.
    //
    // A still-NULL last_synced_at (mid-window progress recorded before any
    // window was ever drained) is left out too, or an interrupted first-ever
    // sync would stop looking like one and lose the setup escape hatch.
    const lastSyncedMap = syncState.reduce(
      (acc, row) => {
        if (!(row.table_name in DUPLICATE_NAME_TABLES) && row.last_synced_at) {
          acc[row.table_name] = row.last_synced_at;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    // Where the last round got to inside each table's still-undrained delta
    // window. A table that finished its backlog has none (it is cleared when
    // its cursor is stamped), so a normal incremental pull starts from the
    // window boundary exactly as before.
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

    let pulledCount = 0;
    const updatedTables: string[] = [];
    // Collected rather than reported inline: logCrash writes to SQLite
    // itself, and calling it from inside the transaction() callback below
    // would nest a write transaction inside this one. Reported once the
    // outer transaction has committed instead.
    const skippedRecords: { table: string; recordId: string; reason: string }[] = [];

    // Offset-based paging within this pull round: the server caps each
    // response at 500 rows/table and reports has_more per table (see
    // SyncController::pull). $lastSyncedMap stays fixed for the whole round
    // — it's the delta-window boundary — while pageOffsets walks that same
    // filtered, deterministically-ordered (updated_at, id) result set page
    // by page. Previously this only ever fetched page 1 and then stamped
    // the cursor to now() regardless, permanently losing every row past the
    // 500th changed row in any table (see docs/KNOWN_BUGS.md).
    //
    // Known limitation: offset pagination isn't immune to concurrent writes
    // landing mid-round (a row inserted between page 1 and page 3 can shift
    // offsets and be skipped or double-counted within this round). That's
    // an accepted tradeoff over the previous behavior — a page missed this
    // way still has updated_at >= this round's start, so it's caught by a
    // subsequent sync's normal delta pull once this round's cursor logic
    // below applies. Multi-page rounds are also rare in practice (only
    // triggered by backlogs over 500 rows in a single table).
    const pageOffsets: Record<string, number> = {};
    const skippedTables = new Set<string>();
    const missingLocalTables = new Set<string>();

    // stock_movements deltas whose referencing stock_batches row hadn't been
    // inserted locally yet at the time the movement was pulled (see the
    // comment where this is populated below). Applied once, in original
    // order, after every page across every table has been pulled.
    const deferredMovementDeltas: { stockBatchId: string; quantity: number }[] = [];
    // When a delta gets deferred, stock_movements' own cursor stamp is held
    // back here (rather than being committed with its page's transaction) so
    // the stamp and the deltas it defers can commit atomically together in
    // the final transaction below. Committing the cursor first would mean a
    // crash in the window between the two left the cursor saying "these
    // movements are pulled" while their deltas were never applied — and a
    // movement is only ever seen by the insert branch once, so the increment
    // would be lost permanently.
    let deferredMovementCursor: string | null = null;
    // Same reasoning for the mid-window position: persisting it early would
    // claim those movements as pulled while their deltas were still pending.
    let deferredMovementPageCursor: string | null = null;

    let hasMoreAny = true;
    let page = 0;

    while (hasMoreAny && page < MAX_PULL_PAGES) {
      page++;

      // Fetch changes from server
      const response = (await apiClient.pullChanges(
        {
          last_synced: lastSyncedMap,
          page_offset: { ...pageOffsets },
          page_cursor: { ...pageCursors },
        },
        isManual,
        isSetup,
        runId,
      )) as PullResponse;
      const { changes, server_timestamp, has_more } = response;

      if (!changes || Object.keys(changes).length === 0) {
        break;
      }

      // stock_movements' insert branch below increments the stock_batches row
      // it references (see the comment there); that row must already exist
      // locally or the UPDATE is a silent no-op, permanently losing the
      // increment. The server response's table order happens to put
      // stock_batches first today (SyncController::pull's own $tables list
      // order), but that's incidental, not a contract — sorted explicitly
      // here so this doesn't silently break if that list is ever reordered.
      const orderedEntries = Object.entries(changes).sort(([a], [b]) => {
        if (a === b) return 0;
        if (a === "stock_batches") return -1;
        if (b === "stock_batches") return 1;
        return 0;
      });

      await transaction(async () => {
        for (const [table, records] of orderedEntries) {
          if (!Array.isArray(records)) continue;

          const validColumns = await getValidColumns(table);

          // A table this device's local schema doesn't have yet (it predates
          // the migration that added it) is skipped for this round instead of
          // being allowed to throw: every table in this page shares one
          // transaction, so a single missing table would otherwise roll back
          // stores and users along with it — which is how a schema-drifted
          // device turned its first sync into "no staff accounts were found".
          // Nothing is persisted for it, so a later round re-offers the same
          // window once the table exists; the in-memory page position still
          // advances so this round terminates.
          if (validColumns.size === 0) {
            if (!missingLocalTables.has(table)) {
              missingLocalTables.add(table);
              console.warn(
                `[SyncPull] Skipping "${table}": this device has no local schema for it.`,
              );
              logCrash(
                new Error(`Pull skipped table ${table}: missing from local schema`),
                false,
                { area: "sync-pull", table },
              ).catch(() => {});
            }
            pageOffsets[table] = (pageOffsets[table] ?? 0) + records.length;
            const missingTableCursor = cursorForLastRecord(records);
            if (missingTableCursor) {
              pageCursors[table] = missingTableCursor;
            }
            continue;
          }

          if (records.length > 0) {
            updatedTables.push(table);
          }

          // If any record in this table's batch gets skipped below (because a
          // local edit for it hasn't been pushed yet), the per-table sync
          // cursor must not advance past it; otherwise the server's copy of
          // that record would never be re-offered on a future pull (its
          // updated_at is already older than the new cursor), and the local
          // row would be stuck showing stale, already-superseded data forever.
          // Leaving the cursor where it was just means this same batch gets
          // re-fetched and re-applied next time, which is harmless: applying
          // an already-applied change again is a no-op.
          let anySkipped = false;

          for (const record of records) {
            const { id, _deleted, ...rawData } = record;
            const recordId = id as string;

            const data: Record<string, unknown> = {};
            for (const key in rawData) {
              if (validColumns.has(key)) {
                data[key] = rawData[key];
              }
            }

            // stock_batches.quantity is never trusted from a pulled snapshot,
            // mirroring the server's own rule for pushed payloads
            // (SyncController::push: "quantity is never trusted from a client
            // payload... always derived by applying stock_movements deltas").
            // The server's pulled value is only as current as whichever of
            // this batch's movements it had already processed at pull time —
            // if this batch's own opening-stock movement (or any other
            // device's movement) hasn't landed yet, or if THIS device has
            // local movements it hasn't pushed yet, blindly writing the
            // pulled quantity here clobbers real local state with a stale
            // snapshot (reproduced: a pull racing a push left ~500 batches
            // permanently forked into duplicates, since a zeroed batch
            // becomes invisible to the "does one already exist" check
            // elsewhere — see docs/KNOWN_BUGS.md). Quantity instead stays
            // whatever local movements have already derived it to be, and
            // gets kept in sync going forward by the stock_movements insert
            // branch below applying each new pulled movement's delta locally,
            // exactly like the server's own `increment('quantity', delta)`.
            if (table === "stock_batches") {
              delete data.quantity;
            }

            for (const deviceLocalColumn of DEVICE_LOCAL_PULL_COLUMNS[table] ?? []) {
              delete data[deviceLocalColumn];
            }

            const columns = Object.keys(data);
            const values = columns.map((c) => {
              const val = data[c];
              if (typeof val === "boolean") {
                return val ? 1 : 0;
              }
              // A JSON-cast server attribute (e.g. permission_groups.
              // permissions, an array) arrives here as a real JS array/
              // object, not a pre-stringified value - binding it straight
              // into the statement silently mis-serializes it (sql.js
              // turns an array into an object of numeric keys), producing
              // a value no later JSON.parse() of this column can read back.
              // Matches how every local write of a JSON-shaped column
              // already stores it (see insert()/update() call sites that
              // pass JSON.stringify(...) themselves).
              if (val !== null && typeof val === "object") {
                return JSON.stringify(val);
              }
              return val;
            });

            // Check if record already exists to preserve local-only columns (e.g. is_initialized, theme, license_token)
            const exists = await query<{ 1: number }>(
              `SELECT 1 FROM ${table} WHERE id = ?`,
              [recordId]
            );

            const version = (rawData._version as number) || 1;

            if (exists.length > 0) {
              // Don't blindly overwrite a row that has a local edit still
              // waiting to be pushed; otherwise the user's own not-yet-synced
              // change gets silently discarded here, before the server ever
              // gets a chance to compare versions and decide which edit should
              // win. Defer to the next push (now that push preserves _version
              // instead of stripping it) to resolve the conflict properly;
              // this pull just leaves the local row alone for now.
              const pendingLocalEdit = await query<{ 1: number }>(
                "SELECT 1 FROM _sync_queue WHERE table_name = ? AND record_id = ? LIMIT 1",
                [table, recordId],
              );
              if (pendingLocalEdit.length > 0) {
                anySkipped = true;
                continue;
              }

              // Update only columns returned by server to preserve local columns
              const setClause = [...columns, "_synced", "_version", "_deleted"]
                .map((c) => `${c} = ?`)
                .join(", ");
              const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
              const params = [
                ...values as (string | number | null)[],
                1,
                version,
                _deleted ? 1 : 0,
                recordId,
              ];

              try {
                await execute(sql, params);
              } catch (err) {
                const errMsg =
                  typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
                if (errMsg.includes("UNIQUE constraint failed")) {
                  console.warn(
                    `[Sync] Skipped updating record in ${table} due to unique constraint:`,
                    recordId,
                    errMsg
                  );
                  skippedRecords.push({ table, recordId, reason: `update: ${errMsg}` });
                  // This record wasn't actually applied — don't let the
                  // per-table cursor advance past it, or it's never
                  // retried (see docs/KNOWN_BUGS.md), unless it's already
                  // been retried this many times with no resolution.
                  if (!recordUniqueSkipAndCheckGiveUp(table, recordId)) {
                    anySkipped = true;
                  }
                } else {
                  throw err;
                }
              }
            } else {
              // Insert new record
              const allCols = [
                "id",
                ...columns,
                "_synced",
                "_version",
                "_deleted",
              ];
              const allPlaceholders = allCols.map(() => "?");
              const sql = `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${allPlaceholders.join(", ")})`;
              const params = [
                recordId,
                ...values as (string | number | null)[],
                1,
                version,
                _deleted ? 1 : 0,
              ];

              try {
                await execute(sql, params);

                // A newly-pulled stock_movements row (this branch only runs
                // once per movement — they're an immutable log, never
                // updated, so a movement is only ever seen here on the pull
                // that first introduces it to this device) applies its own
                // delta to the batch it references, the same way
                // stock_batches.quantity itself is now never trusted from a
                // pulled snapshot (see the comment above where `quantity` is
                // stripped from `data` for that table). This is what keeps a
                // batch's local quantity in sync with what OTHER
                // devices/terminals have done to it, without ever trusting a
                // pulled quantity snapshot directly — mirroring the server's
                // own delta application exactly, floor included: a batch's
                // running balance is never written negative (an oversell is
                // surfaced separately, see getOversoldAlerts()), matching
                // deductFromBatch()'s own local floor a few lines below this
                // module and SyncController::push()'s $stockBatchDeltas
                // application. Without this floor here too, an oversell on
                // one device (batch floored at 0 locally there) diverged
                // permanently from every OTHER device applying the same
                // movement's raw, unfloored delta — see docs/KNOWN_BUGS.md.
                if (
                  table === "stock_movements" &&
                  !_deleted &&
                  data.stock_batch_id &&
                  typeof data.quantity === "number"
                ) {
                  // The batch this movement references may not exist
                  // locally yet: batches and movements are paginated
                  // independently, so a movement can arrive on an earlier
                  // page than the batch it references (the per-page
                  // ordering above only guarantees ordering WITHIN one
                  // page, not across pages). Applying the delta now would
                  // silently no-op (UPDATE ... WHERE id = ? matching zero
                  // rows) and permanently lose the increment, since a
                  // movement is only ever seen here once. Defer it instead
                  // — applied once every page has been pulled, by which
                  // point every batch this round could reference has
                  // already been inserted, in the very same transaction as
                  // this table's cursor stamp (held back for exactly that
                  // reason, see deferredMovementCursor).
                  const batchExists = await query<{ 1: number }>(
                    "SELECT 1 FROM stock_batches WHERE id = ?",
                    [data.stock_batch_id as string],
                  );
                  if (batchExists.length > 0) {
                    await execute(
                      "UPDATE stock_batches SET quantity = MAX(0, quantity + ?) WHERE id = ?",
                      [data.quantity, data.stock_batch_id as string],
                    );
                  } else {
                    deferredMovementDeltas.push({
                      stockBatchId: data.stock_batch_id as string,
                      quantity: data.quantity as number,
                    });
                  }
                }
              } catch (err) {
                const errMsg =
                  typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
                if (errMsg.includes("UNIQUE constraint failed")) {
                  console.warn(
                    `[Sync] Skipped inserting record in ${table} due to unique constraint:`,
                    recordId,
                    errMsg
                  );
                  skippedRecords.push({ table, recordId, reason: `insert: ${errMsg}` });
                  // Not actually applied — same reasoning as the update
                  // branch above: don't let the cursor skip past it, unless
                  // it's already been retried this many times.
                  if (!recordUniqueSkipAndCheckGiveUp(table, recordId)) {
                    anySkipped = true;
                  }
                } else {
                  throw err;
                }
              }
            }

            pulledCount++;
          }

          // 'stores' is always a full, unfiltered snapshot of every store this
          // account owns (see SyncController::pull, which deliberately exempts
          // it from the last-synced cursor other tables use), so, unlike
          // every other table, a local store row NOT in this response isn't
          // just "not updated yet," it's confirmed stale: created on this
          // device before it was ever cloud-linked, or left over from a
          // previously-linked account. Every other table only ever gets
          // additive inserts/updates from pull with no equivalent reconcile
          // step, since a partial/delta response there can't be safely
          // treated as authoritative the way this always-full snapshot can.
          if (table === "stores" && records.length > 0 && storesSnapshotIsAccountWide()) {
            const serverStoreIds = records.map((r) => r.id as string);
            const placeholders = serverStoreIds.map(() => "?").join(", ");
            // A store with an unpushed local edit is never a prune candidate,
            // for the same reason the row-apply branch above refuses to
            // overwrite one: this device holds state the server has not seen
            // yet. It is also the one case the prune could not be recovered
            // from — that same pending queue row makes every later pull skip
            // the store's row, so the `_deleted = 1` written here would never
            // be cleared again even once a correctly-scoped snapshot lists it.
            const pruneCandidates = await query<{ id: string }>(
              `SELECT id FROM stores WHERE _deleted = 0 AND id NOT IN (${placeholders})
                 AND id NOT IN (SELECT record_id FROM _sync_queue WHERE table_name = 'stores')`,
              serverStoreIds,
            );

            if (pruneCandidates.length > 0) {
              // Never silently prune a store that has real accumulated
              // business data attached; a store the server doesn't currently
              // recognize is still not "safe to hide" if it's the one
              // everything on this device's local history is actually
              // attributed to (e.g. the original pre-cloud-link store on a
              // device, before it was ever reconciled with a server-side
              // account). Losing visibility into real data is a far worse
              // outcome than a stale entry lingering in the switcher, so this
              // only prunes stores that are genuinely empty locally — checked
              // against every store-scoped table, not just products/sales: a
              // store whose only local data is, say, expenses or customers
              // deserves the exact same protection.
              // Most STORE_SCOPED_TABLES only gain their store_id column via
              // initDatabase()'s runtime ALTER TABLE migration, not the base
              // schema (see core.ts) — a device that hasn't run that migration
              // yet (or a test harness that bypasses it) would make this query
              // throw "no such column: store_id", rolling back the whole pull
              // transaction rather than just skipping the prune check for that
              // one table.
              const scopedTablesWithStoreId: string[] = [];
              for (const t of STORE_SCOPED_TABLES) {
                if (await columnExists(t, "store_id")) {
                  scopedTablesWithStoreId.push(t);
                }
              }
              const noDataClauses = scopedTablesWithStoreId.map(
                (t) => `AND id NOT IN (SELECT DISTINCT store_id FROM ${t} WHERE store_id IS NOT NULL)`,
              ).join("\n                ");
              const candidatePlaceholders = pruneCandidates.map(() => "?").join(", ");
              const pruneSql = `
                UPDATE stores SET _deleted = 1
                WHERE id IN (${candidatePlaceholders})
                  ${noDataClauses}
              `;

              await execute(pruneSql, pruneCandidates.map((r) => r.id));
            }
          }

          if (DUPLICATE_NAME_TABLES[table] && records.length > 0) {
            const serverIds = new Set(records.map((r) => r.id as string));
            const serverIdByName = new Map<string, string>();
            for (const r of records) {
              const name = String(r.name ?? "").trim().toLowerCase();
              if (name) serverIdByName.set(name, r.id as string);
            }

            const localRows = await query<{ id: string; name: string }>(
              `SELECT id, name FROM ${table} WHERE (_deleted = 0 OR _deleted IS NULL)`,
            );

            for (const row of localRows) {
              if (serverIds.has(row.id)) continue;
              const matchedServerId = serverIdByName.get(String(row.name ?? "").trim().toLowerCase());
              if (!matchedServerId || matchedServerId === row.id) continue;

              await remapForeignKey(row.id, matchedServerId, DUPLICATE_NAME_TABLES[table]);

              // The local duplicate is now redundant: every reference points
              // at the server's row instead. Soft-delete it rather than leave
              // an orphaned, unreferenced duplicate in the local table.
              await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [row.id]);
            }
          }

          pageOffsets[table] = (pageOffsets[table] ?? 0) + records.length;
          if (anySkipped) {
            skippedTables.add(table);
          }

          // Always advances, even past a skipped record, or the next request
          // would re-ask for this page and the round would never terminate.
          const nextCursor = cursorForLastRecord(records);
          if (nextCursor) {
            pageCursors[table] = nextCursor;
          }

          // Only stamp this table's cursor once its backlog for this round
          // is fully drained (has_more false) and no page along the way hit
          // a pending-local-edit skip; otherwise a row past this page, or
          // the skipped row itself, would never be re-offered by a future
          // pull once the cursor moves past its updated_at.
          const tableHasMore = has_more?.[table] ?? false;

          // Unlike the window stamp below, the position inside an undrained
          // window is persisted per page (docs/SYNC_PULL_PAGINATION.md).
          if (tableHasMore && nextCursor && !skippedTables.has(table)) {
            if (table === "stock_movements" && deferredMovementDeltas.length > 0) {
              deferredMovementPageCursor = JSON.stringify(nextCursor);
            } else {
              await execute(PULL_PROGRESS.savePosition, [table, JSON.stringify(nextCursor)]);
            }
          }

          if (!tableHasMore && !skippedTables.has(table)) {
            criticalTablesPending.delete(table);
            // A pulled movement whose delta had to be deferred (its batch
            // hadn't arrived yet) isn't fully applied until that delta is,
            // so stock_movements' cursor must not be committed here, in
            // this page's transaction: it's carried to the final
            // transaction below and committed atomically with the deltas
            // themselves. Otherwise a crash between this commit and that
            // one would leave the cursor claiming the movements were
            // pulled while their deltas were silently lost forever.
            if (table === "stock_movements" && deferredMovementDeltas.length > 0) {
              deferredMovementCursor = server_timestamp;
            } else {
              await execute(PULL_PROGRESS.completeWindow, [table, server_timestamp]);
            }
          }
        }
      }).catch((err) => {
        // Not reported here: rethrown, so the outer catch below reports it
        // once instead of twice.
        console.error("Failed to apply pull changes:", err);
        throw err;
      });

      hasMoreAny = Object.values(has_more ?? {}).some(Boolean);

      // Checked after the page's transaction has actually committed, same
      // reasoning as every other "report once committed" spot in this
      // file - stores/users are typically small enough (a full snapshot,
      // and a handful of staff) to drain within the very first page.
      if (criticalTablesPending.size === 0) {
        fireCriticalReadyOnce(true);
      }
    }

    // The deferred deltas and the stock_movements cursor stamp they belong to
    // commit as one unit: either the movements count as pulled AND their
    // deltas are applied, or neither happened and the next pull re-offers the
    // same movements (whose insert branch will then re-derive the deltas).
    // There is deliberately no window in between for a crash to fall into.
    if (
      deferredMovementDeltas.length > 0 ||
      deferredMovementCursor !== null ||
      deferredMovementPageCursor !== null
    ) {
      await transaction(async () => {
        for (const d of deferredMovementDeltas) {
          await execute(
            "UPDATE stock_batches SET quantity = MAX(0, quantity + ?) WHERE id = ?",
            [d.quantity, d.stockBatchId],
          );
        }
        if (deferredMovementCursor !== null) {
          await execute(PULL_PROGRESS.completeWindow, [
            "stock_movements",
            deferredMovementCursor,
          ]);
        } else if (deferredMovementPageCursor !== null) {
          await execute(PULL_PROGRESS.savePosition, [
            "stock_movements",
            deferredMovementPageCursor,
          ]);
        }
      });
    }

    for (const s of skippedRecords) {
      logCrash(
        new Error(`Pull skipped ${s.table}/${s.recordId}: ${s.reason}`),
        false,
        { area: "sync-pull", table: s.table, recordId: s.recordId },
      ).catch(() => {});
    }

    return { pulled: pulledCount, updatedTables };
  } catch (error) {
    pullFailed = true;
    console.error("Pull sync failed:", error);
    logCrash(error, false, { area: "sync-pull" }).catch(() => {});
    throw error; // Throw so sync() can catch it properly
  } finally {
    // Fallback for the rare case the per-page check inside the loop never
    // saw criticalTablesPending empty (e.g. this round had zero stores/
    // users changes at all, so the loop broke on an empty `changes` before
    // ever reaching that check) - and, via `finally` rather than only the
    // success path, for a THROWN pull too, so a caller awaiting this
    // callback is never left hanging just because the pull that was
    // supposed to signal it blew up first. The success flag keeps those two
    // cases apart: a thrown pull wrote nothing, so reporting it as "identity
    // ready" made onboarding announce a failed sync as a store with no staff.
    fireCriticalReadyOnce(!pullFailed);
  }
}
