/**
 * Core Database Logic
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { APP_NAME } from "@/lib/constants";
import { get, set } from "idb-keyval";
/* eslint-disable max-lines */
import { SCHEMA_SQL } from "./schema";
import {
  STORE_SCOPED_TABLES,
  makeTauriAdapter,
  makeSqlJsAdapter,
  runSchemaMigrations,
} from "./schema-migrations";

// Dual-backend handle: sql.js's Database in the browser, @tauri-apps/plugin-sql's
// Database (a different, incompatible shape: .execute()/.select() vs sql.js's
// .exec()/.run()) when running inside Tauri. Deliberately untyped rather than a
// misleading union, since callers already branch on isTauri() before touching it.
let SQL: SqlJsStatic | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;
let currentUser: {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
} | null = null;

export function setCurrentUser(
  user: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
  } | null,
) {
  currentUser = user;
}

// Used to scope React Query cache keys (see lib/query-keys.ts's `resource`)
// so a switch between logged-in users on this device can never read a
// cache slot the outgoing user's queries wrote into.
export function getCurrentUserId(): string | null {
  return currentUser?.id ?? null;
}

// The store every domain query should be scoped to. Set from
// store-context.tsx's effect mirroring `user?.store_id || activeStoreId`;
// a staff member's fixed store_id always wins over any switcher state, same
// precedence the UI already uses. Module-scope (not threaded as a function
// param) because the query layer is plain async functions with no React
// context available, called from ~40+ hook sites across the app.
let activeStoreId: string | null = null;

export function setActiveStoreId(id: string | null) {
  activeStoreId = id;
}

export function getActiveStoreId(): string | null {
  return activeStoreId;
}

/** Test-only: injects a bare database instance directly, bypassing
 * initDatabase()'s IndexedDB persistence and schema-migration machinery, so
 * unit tests can exercise query()/execute()/transaction() against a real
 * SQLite engine (e.g. a throwaway sql.js instance) instead of mocks. Never
 * called from production code paths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setDatabaseForTesting(instance: any): void {
  db = instance;
}

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.__TAURI__ !== undefined ||
      window.__TAURI_INTERNALS__ !== undefined)
  );
}

export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** A short, human-scannable identifier for a display field that still needs
 * to be genuinely unique (receipt/transaction numbers) - not a wrapper
 * every id needs, only ids a person reads. Uses the first two segments of
 * generateId() (48 random bits) rather than the full id: enough headroom
 * that a birthday collision needs tens of millions of transactions to
 * become likely, while staying short enough to print on a receipt. */
export function generateShortId(): string {
  return generateId().split("-").slice(0, 2).join("").toUpperCase();
}

// STORE_SCOPED_TABLES and the schema-migration machinery now live in
// ./schema-migrations; re-exported here so existing importers of
// `STORE_SCOPED_TABLES` from "./core" keep working unchanged.
export { STORE_SCOPED_TABLES };


// Returns the same deliberately-untyped dual-backend handle `db` holds — see
// its declaration above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initDatabase(): Promise<any> {
  if (db) return db;

  if (isTauri()) {
    try {
      const sqlPlugin = await import("@tauri-apps/plugin-sql");
      // Defensive: covers both an ESM default export and a CJS-style named
      // export, since which shape the plugin resolves to isn't guaranteed
      // across bundler/runtime versions.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Database = sqlPlugin.default || (sqlPlugin as any).Database;

      db = await Database.load("sqlite:dumosrx.db");

      // The Tauri SQL plugin hands out a pooled sqlx connection, and SQLite's
      // default (rollback-journal) mode only allows one writer at a time:
      // two pooled connections writing close together can lock each other
      // out for multiple seconds, or fail outright with "database is
      // locked", with no PRAGMA tuning applied by default. WAL lets readers
      // and a writer proceed concurrently instead of blocking each other,
      // and busy_timeout makes SQLite retry internally for up to 5s instead
      // of erroring immediately when a write does have to wait its turn.
      try {
        await db.execute("PRAGMA journal_mode = WAL;");
        await db.execute("PRAGMA busy_timeout = 5000;");
        await db.execute("PRAGMA synchronous = NORMAL;");
      } catch (e) {
        console.error("Failed to set SQLite concurrency PRAGMAs", e);
      }

      const statements = SCHEMA_SQL.split(";").filter((s) => s.trim());
      for (const statement of statements) {
        await db.execute(statement);
      }

      const tauriAdapter = makeTauriAdapter(db);
      // Tauri's SQL plugin writes land on disk directly; no save step needed.
      await runSchemaMigrations(tauriAdapter);

      return db;
    } catch (err) {
      console.error("Failed to init Tauri DB", err);
      throw err;
    }
  }

  try {
    if (!SQL) {
      SQL = await initSqlJs({
        locateFile: (file: string) => `/${file}`,
      });
    }

    let savedData: Uint8Array | undefined = await get(`${APP_NAME.toLowerCase()}_db`);

    // Migration from legacy localStorage to IndexedDB
    if (!savedData) {
      const legacySavedData = localStorage.getItem(`${APP_NAME.toLowerCase()}_db`);
      if (legacySavedData) {
        try {
          savedData = new Uint8Array(JSON.parse(legacySavedData));
          await set(`${APP_NAME.toLowerCase()}_db`, savedData);
          localStorage.removeItem(`${APP_NAME.toLowerCase()}_db`);
        } catch (e) {
          console.error("Failed to migrate legacy db", e);
        }
      }
    }

    if (savedData) {
      try {
        db = new SQL.Database(savedData);

        // Ensure new tables from schema updates are created
        db.run(SCHEMA_SQL);
      } catch (_e) {
        console.error("[DB] Failed to load saved data, starting fresh", _e);
        db = new SQL.Database();
        db.run(SCHEMA_SQL);
      }
    } else {
      db = new SQL.Database();
      db.run(SCHEMA_SQL);
    }

    const webAdapter = makeSqlJsAdapter(db);

    await runSchemaMigrations(webAdapter, saveDatabase);

    return db;
  } catch (err) {
    console.error("[DB] Failed to initialize database:", err);
    throw err;
  }
}

export async function saveDatabase(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await set(`${APP_NAME.toLowerCase()}_db`, data).catch(err => {
    console.error("Failed to save DB to IndexedDB", err);
  });
}

// Set while a transaction() block is running — declared here (rather than
// only where execute() first needed it, further down) so query()'s row-fetch
// yield above can also read it. See execute()/transaction() below for the
// deferred-saveDatabase() half of what this flag is for.
let inTransaction = false;

// Lets a composed multi-statement helper (e.g. insert() in base-helpers.ts)
// decide whether it needs to open its own transaction() for atomicity, or is
// already running inside a caller's transaction() and must not (nesting
// deadlocks - see transaction()'s doc comment below).
export function isInTransaction(): boolean {
  return inTransaction;
}

// How many rows query() fetches before yielding a tick back to the browser
// (see the loop below) — large enough that small/typical queries (the vast
// majority) never pay the setTimeout round-trip at all.
const QUERY_YIELD_INTERVAL = 200;

/**
 * Bumped once by every write that could land while some other query() is
 * suspended at one of its yield points (see the loop in query()).
 *
 * sql.js has a single shared connection with no reader isolation: a SELECT
 * that yields mid-iteration is stepping through a live statement, and a
 * write that interleaves into one of those yields modifies the very table
 * it's walking. SQLite's behavior then is undefined — rows can be skipped,
 * and the statement can be reset or invalidated outright, which ends the
 * step loop early and returns a *short or entirely empty* result with no
 * error raised (the "Statement closed" throw retried below is the loud
 * version of the same collision; this is the silent one).
 *
 * That's the Product Catalog's "No products found" after a large sync:
 * getProductsWithDetails() returns ~1900 rows, so it's one of the very few
 * queries that yields at all, and a draining sync backlog is exactly when
 * writes are landing continuously. Single-row aggregate queries (e.g.
 * getStockBatchStats()'s "Total Products") never reach a yield point, which
 * is why those stayed correct throughout the same window.
 *
 * Reads issued *inside* a transaction() block are unaffected: they never
 * yield (the `!inTransaction` guard below), so nothing can interleave into
 * them, and their epoch can't move under them either.
 */
let writeEpoch = 0;

function bumpWriteEpoch(): void {
  // Wrap well below MAX_SAFE_INTEGER; only equality across one query matters.
  writeEpoch = (writeEpoch + 1) % 0xffffffff;
}

// How many times query() will re-run a read that a concurrent write may have
// torn. Bounded so a device under permanently continuous write load returns
// *something* rather than looping forever; in practice one retry is enough,
// since the retry re-runs against whatever state the writes have reached.
const QUERY_TORN_READ_ATTEMPTS = 4;

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
): Promise<T[]> {
  if (!db) {
    try {
      await initDatabase();
    } catch (err) {
      console.error("[DB] Query failed due to database init error:", err);
      return [];
    }
  }

  if (!db) return [];

  if (isTauri()) {
    return await db.select(sql, params);
  }

  // Retried once on "Statement closed": reproduced under heavy concurrent
  // write load (a large bulk import's push/pull activity overlapping this
  // query's own yields below) — some other operation invalidates this
  // statement's handle mid-loop, and every subsequent .step() call on it
  // throws that error forever after, permanently wedging whatever was
  // running this query (the sync engine, in the reproduction — see
  // docs/KNOWN_BUGS.md). The exact sql.js-internal mechanism wasn't
  // isolated, but the fix doesn't need to know it: a SELECT has no side
  // effects, so discarding whatever partial `results` a failed attempt
  // collected and re-`prepare()`-ing a fresh statement against the same
  // (still-valid — only the statement handle itself was invalidated, not
  // the connection) `db` is always safe to retry. Capped at one retry so a
  // genuinely different, non-transient failure still surfaces instead of
  // silently retrying forever.
  //
  // The same loop also re-runs a read that merely *might* have been torn by
  // an interleaved write — see writeEpoch above for why a silently
  // truncated result is the more dangerous of the two outcomes.
  //
  // Either way, a re-run must not simply re-prepare against whatever the
  // connection looks like *right now*: the write that forced the retry is
  // very often a sync apply's transaction() that is still open, and sql.js's
  // single connection means an immediate re-run reads its uncommitted,
  // half-applied intermediate state (same reads-your-own-writes hazard
  // awaitSettledTransactions() was added for). Retries therefore wait for
  // every in-flight transaction to settle first, so a read only ever
  // reports committed state. Safe from deadlock: a read issued from inside
  // a transaction() block would be waiting on its own enclosing
  // transaction, so this only applies to reads that began outside one.
  const startedOutsideTransaction = !inTransaction;
  let closedRetryUsed = false;
  for (let attempt = 0; attempt < QUERY_TORN_READ_ATTEMPTS; attempt++) {
    const epochAtStart = writeEpoch;
    let yielded = false;
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);

      const results: T[] = [];
      let rowCount = 0;
      while (stmt.step()) {
        const row = stmt.getAsObject() as T;
        results.push(row);
        rowCount++;
        // sql.js runs entirely on the main thread with no Web Worker, so a
        // large result set's row-fetch loop blocks painting for however
        // long it takes — nothing else, including React committing an
        // already-rendered loading skeleton, can run until this returns.
        // This is the same characteristic product-import.ts's
        // YIELD_INTERVAL comment describes for bulk inserts, just on the
        // read side, and it compounds right after app launch when several
        // heavy stat/overview queries (Inventory, Settings) land close
        // together with sync's own DB work.
        // Only outside an open transaction: execute() doesn't queue behind
        // an in-progress transaction() the way nested transaction() calls
        // do (sql.js has one shared connection, no per-caller isolation),
        // so yielding here while `inTransaction` is true would let an
        // unrelated write interleave into this transaction's uncommitted
        // state.
        if (!inTransaction && rowCount % QUERY_YIELD_INTERVAL === 0) {
          yielded = true;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      stmt.free();

      // A write landed while this statement was suspended at one of the
      // yields above, so these rows may be a torn snapshot of a table that
      // changed underneath the cursor — including, in the worst case, an
      // empty one from a statement SQLite quietly reset. Re-run rather than
      // hand a caller a result that looks authoritative but isn't. Safe to
      // repeat: query() only ever runs SELECTs (writes go through
      // execute()), so a re-run has no side effects.
      if (
        yielded &&
        writeEpoch !== epochAtStart &&
        attempt < QUERY_TORN_READ_ATTEMPTS - 1
      ) {
        if (startedOutsideTransaction) await awaitSettledTransactions();
        continue;
      }

      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        stmt.free();
      } catch {
        // Already invalid — this is exactly the case being retried.
      }
      if (!closedRetryUsed && /closed|finalized/i.test(message)) {
        closedRetryUsed = true;
        if (startedOutsideTransaction) await awaitSettledTransactions();
        continue;
      }
      throw err;
    }
  }

  // Unreachable (the loop above always either returns or throws), but
  // TypeScript can't see that from a for-loop with a fixed bound.
  return [];
}

// Registered by base-helpers.ts (which already imports from this module, so
// this module can't import back without a cycle) so insert()/update()/
// softDelete() can route their React Query invalidation through here instead
// of calling queryClient directly. During a transaction() block, invalidating
// after every single row (e.g. a 1000+ row spreadsheet import) means as many
// refetches of whatever list is on screen — that refetch storm, not the SQL
// work itself, is what froze the tab on a bulk import. Collecting the
// touched table names and invalidating each one once, after the transaction
// settles, keeps the same eventual invalidation with a bounded cost per
// transaction instead of per row.
let invalidateTablesFn: ((tables: Iterable<string>) => void) | null = null;
let pendingInvalidations: Set<string> | null = null;

export function registerInvalidateTablesFn(
  fn: (tables: Iterable<string>) => void,
): void {
  invalidateTablesFn = fn;
}

// Separate from invalidateTablesFn above (React Query cache invalidation):
// this is for plan-tier "sync instantly after any change" — see
// SyncIndicator's instant-sync mode. A Set, not a single callback slot,
// because SyncIndicator mounts multiple simultaneous instances (sidebar,
// mobile header, mobile drawer) whose subscribe/unsubscribe lifecycles are
// independent; a single slot would let one instance's unmount silently
// kill another still-mounted instance's subscription.
const syncQueueChangeListeners = new Set<() => void>();

export function addSyncQueueChangeListener(fn: () => void): () => void {
  syncQueueChangeListeners.add(fn);
  return () => syncQueueChangeListeners.delete(fn);
}

function notifySyncQueueChangeListeners(): void {
  for (const fn of syncQueueChangeListeners) fn();
}

export function queueTableInvalidation(table: string): void {
  if (inTransaction && pendingInvalidations) {
    pendingInvalidations.add(table);
  } else {
    invalidateTablesFn?.([table]);
    notifySyncQueueChangeListeners();
  }
}

export async function execute(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
): Promise<void> {
  if (!db) {
    try {
      await initDatabase();
    } catch (err) {
      console.error("[DB] Execute failed due to database init error:", err);
      return;
    }
  }

  if (!db) return;

  if (isTauri()) {
    await db.execute(sql, params);
    return;
  }

  db.run(sql, params);
  // Marks the shared sql.js connection as having been written to, so any
  // query() currently suspended at a yield point knows its in-progress read
  // may have been torn and re-runs instead of returning it (see writeEpoch).
  bumpWriteEpoch();
  if (!inTransaction) {
    void saveDatabase();
  }
}

/**
 * Serializes every transaction() call so their BEGIN/COMMIT pairs can never
 * interleave. This used to be guarded only by `inTransaction`, a plain
 * module-level boolean with no way to tell a genuinely-nested call (same
 * synchronous call chain, safe to run inline against the already-open
 * transaction) apart from two merely *concurrent*, unrelated calls that
 * happen to overlap in wall-clock time — e.g. a background sync's
 * multi-batch pushChanges() loop, which awaits between batches, still
 * running when the cashier's createSale() also calls transaction(). Both
 * looked identical to that boolean: the second call saw it already `true`
 * and ran inline against the first's still-open transaction, so when the
 * sync's block later threw and rolled back, the unrelated sale's writes
 * were silently rolled back with it — even though createSale() had already
 * returned successfully and the UI showed the sale as recorded.
 *
 * There is no reliable way to distinguish those two cases from inside this
 * function (plain browser/Tauri JS has no async-call-chain identity to
 * check against, unlike Node's AsyncLocalStorage), so nesting isn't
 * supported at all: every call queues and gets its own real BEGIN/COMMIT.
 * A composed operation that needs to run several DB writes as one atomic
 * unit from inside code that's already executing inside a transaction()
 * block must call query()/execute() directly instead of transaction()
 * again — see requeueOrphanedRows() in reconcile-identity.ts for the one
 * real example. Calling transaction() from inside another transaction()'s
 * `fn` will deadlock (the outer call can't finish until the inner one does,
 * but the inner one is queued behind the outer) — an intentional trade-off:
 * a hang during testing is far easier to catch than the silent
 * cross-transaction data loss above.
 */
let transactionQueue: Promise<void> = Promise.resolve();

/**
 * Waits for every transaction() call reserved so far to finish (commit or
 * rollback) before returning. sql.js/the Tauri SQL plugin use one ambient
 * connection, so a plain query() run while a transaction() is mid-flight
 * doesn't see a consistent snapshot — it sees that transaction's uncommitted
 * writes, same-connection reads-your-own-writes style. That's fine for code
 * that already runs its own reads inside a transaction() (they naturally
 * queue behind it), but getPendingSyncItems() reads the sync queue with a
 * bare query() before any network call, from a periodic background timer
 * that has no idea a multi-minute bulk import's transaction() is open. Left
 * unguarded, it can read and push rows from that transaction before it
 * commits — and if the transaction later rolls back (thrown error, or the
 * app closing before COMMIT), those rows are now orphaned on the server with
 * no corresponding local record. Awaiting this first closes that window down
 * to the brief microtask gap between this resolving and the caller's next
 * query() — not a full guarantee (a new transaction() can still reserve the
 * queue in that gap), but sync only needs to miss the multi-minute case that
 * was actually observed, not withstand adversarial timing.
 */
export async function awaitSettledTransactions(): Promise<void> {
  await transactionQueue;
}

/**
 * Runs `fn` inside a real SQL transaction so a multi-statement operation
 * (e.g. recording a sale and deducting stock for every line item) either
 * fully applies or fully rolls back: a crash, thrown error, or early return
 * partway through can never leave the database with only some of the writes
 * applied. Every write inside `fn` must go through query()/execute() (and by
 * extension insert()/update()/etc. in base-helpers.ts) against the same `db`
 * handle used here so it participates in the transaction.
 *
 * Do not call this from inside another transaction()'s `fn` — see the
 * queuing comment above for why that deadlocks instead of nesting.
 *
 * If BEGIN itself fails (e.g. the Tauri SQL plugin's pooled connection
 * doesn't hand back the same connection for the follow-up statements, a
 * real risk with sqlx pooling that can't be verified from static analysis
 * alone), this falls back to running `fn` without transaction semantics
 * rather than blocking the operation entirely: no worse than the previous
 * behavior, just not improved for that run.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  // Reserve our place in line before awaiting anything, so two calls
  // arriving back-to-back (no `await` between them) can't both read the
  // same "previous" link — queue reassignment here is synchronous.
  const previous = transactionQueue;
  // Definite assignment: the executor above runs synchronously (per the
  // Promise spec) before this line returns, so releaseNext is always set
  // by the time it's called below — TS just can't see through the closure.
  let releaseNext!: () => void;
  transactionQueue = new Promise<void>((resolve) => {
    releaseNext = resolve;
  });

  try {
    // Wait for whatever was queued ahead of us, regardless of whether it
    // committed or rolled back — a failed transaction must not permanently
    // block every later one.
    await previous;

    if (!db) {
      await initDatabase();
    }
    if (!db) {
      // Database unavailable; let fn() surface whatever error it hits.
      return await fn();
    }

    let began = false;
    try {
      if (isTauri()) {
        await db.execute("BEGIN");
      } else {
        db.exec("BEGIN");
      }
      began = true;
    } catch (err) {
      console.error("[DB] Failed to start transaction, running without atomicity:", err);
    }

    if (!began) {
      return await fn();
    }

    inTransaction = true;
    pendingInvalidations = new Set();
    try {
      const result = await fn();
      if (isTauri()) {
        await db.execute("COMMIT");
      } else {
        db.exec("COMMIT");
      }
      return result;
    } catch (err) {
      try {
        if (isTauri()) {
          await db.execute("ROLLBACK");
        } else {
          db.exec("ROLLBACK");
        }
      } catch (rollbackErr) {
        console.error("[DB] Rollback failed after transaction error:", rollbackErr);
      }
      throw err;
    } finally {
      inTransaction = false;
      if (!isTauri()) {
        // sql.js: persist once for the whole block instead of per-statement.
        await saveDatabase();
      }
      const tables = pendingInvalidations;
      pendingInvalidations = null;
      if (tables && tables.size > 0) {
        invalidateTablesFn?.(tables);
        notifySyncQueueChangeListeners();
      }
    }
  } finally {
    releaseNext();
  }
}

/**
 * Returns the raw database binary for export: sql.js (web) only. `db` is a
 * real Tauri SQL plugin connection on desktop/mobile, which has no
 * `.export()` method; use backupDatabaseToFile() there instead.
 */
export function getDatabaseBinary(): Uint8Array | null {
  if (!db || isTauri()) return null;
  return db.export();
}

// Tables a genuine DumosRx database must have; used to sanity-check a
// restore candidate before it replaces the live database (see
// restoreDatabase() below). Not exhaustive - just enough that a wrong file
// of the right container format (e.g. some other app's .db/.sqlite) is
// still caught, not just outright garbage that fails to parse at all.
const RESTORE_SANITY_CHECK_TABLES = ["users", "stores", "products", "sales"];

/**
 * Overwrites the current database with provided binary data: sql.js (web)
 * only. On desktop/mobile this would silently disconnect `db` from the real
 * file Tauri's SQL plugin manages without ever writing the restored data to
 * disk; use restoreDatabaseFromFile() there instead.
 *
 * Validates the candidate against a throwaway sql.js instance before
 * touching the live `db` at all (an invalid/corrupt/wrong-app file throws
 * here and the live database is left completely untouched), and snapshots
 * the outgoing database into IndexedDB first so a restore that turns out to
 * be wrong (valid SQLite, but not what the user meant to restore) can still
 * be recovered — see restorePreRestoreSnapshot(). Returns whether that
 * snapshot actually succeeded (e.g. false on an IndexedDB quota failure) so
 * the caller can warn the user their usual undo option won't be available
 * this time, rather than that failure being silently console-only.
 */
export async function restoreDatabase(binaryData: Uint8Array): Promise<{ snapshotSucceeded: boolean }> {
  if (isTauri()) {
    throw new Error(
      "restoreDatabase() is web-only; use restoreDatabaseFromFile() on desktop/mobile.",
    );
  }
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }

  // Constructed against a local variable, not `db` - a malformed file throws
  // here (sql.js validates the SQLite file header) with the live database
  // still fully intact.
  const candidate = new SQL.Database(binaryData);
  try {
    const tableRows = candidate.exec(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tableNames = new Set(
      (tableRows[0]?.values ?? []).map((row) => String(row[0])),
    );
    const missing = RESTORE_SANITY_CHECK_TABLES.filter((t) => !tableNames.has(t));
    if (missing.length > 0) {
      throw new Error(
        `This file doesn't look like a DumosRx backup (missing table${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}).`,
      );
    }
  } catch (err) {
    candidate.close();
    throw err;
  }

  let snapshotSucceeded = true;
  if (db) {
    const outgoing = db.export();
    await set(`${APP_NAME.toLowerCase()}_db_pre_restore_backup`, outgoing).catch(
      (err) => {
        snapshotSucceeded = false;
        console.error("[DB] Failed to snapshot outgoing database before restore", err);
      },
    );
    db.close();
  }

  db = candidate;
  await saveDatabase();
  return { snapshotSucceeded };
}

/**
 * Recovers the database as it stood immediately before the most recent
 * restoreDatabase() call (web only) — the one-generation-deep safety net
 * that restoreDatabase() snapshots into on every restore. Returns false
 * (does nothing) if no snapshot exists yet.
 */
export async function restorePreRestoreSnapshot(): Promise<boolean> {
  const snapshot = await get<Uint8Array>(`${APP_NAME.toLowerCase()}_db_pre_restore_backup`);
  if (!snapshot) return false;
  await restoreDatabase(snapshot);
  return true;
}

/**
 * Desktop/mobile-only backup: lets the user pick a destination via a native
 * save dialog, then writes a consistent snapshot of the live database there
 * with SQLite's VACUUM INTO. Preferred over copying the raw file directly,
 * since VACUUM INTO produces a coherent copy even if writes are landing on
 * the live database around the same time; a raw file copy could otherwise
 * catch it mid-write.
 */
export async function backupDatabaseToFile(): Promise<{ success: boolean; path?: string }> {
  if (!isTauri()) {
    throw new Error("backupDatabaseToFile() is desktop/mobile-only; use getDatabaseBinary() on web.");
  }
  if (!db) {
    await initDatabase();
  }
  if (!db) {
    throw new Error("Database not initialized");
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toISOString().split("T")[1].slice(0, 8).replace(/:/g, "-");

  const destPath = await save({
    defaultPath: `${APP_NAME.toLowerCase()}_backup_${dateStr}_${timeStr}.drx`,
    filters: [{ name: "DumosRx Backup", extensions: ["drx"] }],
  });
  if (!destPath) {
    return { success: false }; // user cancelled the dialog
  }

  // VACUUM INTO doesn't reliably accept a bound parameter for the filename
  // across every SQLite driver combination, so the path is escaped and
  // inlined directly instead. destPath comes from a native OS save dialog
  // (not free-typed user input), but a single-quote in a folder name (e.g.
  // "O'Brien's backups") would still break unescaped string interpolation.
  const escapedPath = destPath.replace(/'/g, "''");
  await db.execute(`VACUUM INTO '${escapedPath}'`);
  return { success: true, path: destPath };
}

// First 16 bytes of any genuine SQLite database file (the format's own
// magic header) — used to reject an obviously-wrong file before it ever
// touches the live database. See restoreDatabaseFromFile() below.
const SQLITE_FILE_HEADER = "SQLite format 3\0";

/**
 * Desktop/mobile-only restore: lets the user pick a backup file via a native
 * open dialog, validates it's at least a real SQLite file, snapshots the
 * live database file (so a restore of the wrong-but-valid file can still be
 * recovered), closes the live SQL connection so the file isn't locked, then
 * overwrites the real dumosrx.db file with it. The caller must reload the
 * app afterward so initDatabase() re-establishes a fresh connection against
 * the restored file.
 */
export async function restoreDatabaseFromFile(): Promise<{ success: boolean }> {
  if (!isTauri()) {
    throw new Error("restoreDatabaseFromFile() is desktop/mobile-only; use restoreDatabase() on web.");
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const sourcePath = await open({
    multiple: false,
    filters: [{ name: "DumosRx Backup", extensions: ["drx", "db", "sqlite", "sqlite3"] }],
  });
  if (!sourcePath || Array.isArray(sourcePath)) {
    return { success: false }; // user cancelled, or somehow picked multiple
  }

  const { copyFile, readFile, exists } = await import("@tauri-apps/plugin-fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");

  // Validate BEFORE touching the live connection/file at all: a garbage or
  // wrong-app file must never get the chance to close the live db and
  // partially overwrite it.
  const candidateBytes = await readFile(sourcePath);
  const header = new TextDecoder().decode(candidateBytes.slice(0, 16));
  if (header !== SQLITE_FILE_HEADER) {
    throw new Error("This file doesn't look like a valid SQLite database.");
  }

  const liveDbPath = await join(await appDataDir(), "dumosrx.db");

  if (db) {
    try {
      // Force every committed transaction sitting in the -wal sidecar back
      // into the main .db file BEFORE snapshotting it below. Without this, a
      // raw copy of dumosrx.db alone can miss the most recent writes (WAL
      // journaling is enabled - see initDatabase()), making the "recoverable"
      // pre-restore snapshot silently incomplete for exactly the data most
      // likely to matter (whatever the user was just doing).
      await db.execute("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (err) {
      console.error("[DB] Failed to checkpoint WAL before restore snapshot:", err);
    }
  }

  if (await exists(liveDbPath)) {
    await copyFile(liveDbPath, `${liveDbPath}.pre-restore-backup`);
  }

  if (db) {
    try {
      await db.close();
    } catch (err) {
      // Do NOT proceed to overwrite the live file past a failed close: with
      // WAL journaling enabled, a still-open connection's -wal/-shm sidecars
      // can replay stale pre-restore data over the freshly-copied file on
      // the next open, silently mixing pre- and post-restore state. Safer
      // to fail the restore outright and let the user retry/reload first.
      console.error("[DB] Failed to close database connection before restore:", err);
      throw new Error(
        "Could not safely close the current database before restoring. Please restart the app and try again.",
      );
    }
    db = null;
  }

  await copyFile(sourcePath, liveDbPath);

  return { success: true };
}

/**
 * Read-only audit of legacy schema artifacts on this device's local
 * database. Checks what initDatabase()'s one remaining legacy-repair step
 * (backfillStoreIdOnLegacyRows — still plausibly load-bearing) exists to
 * fix, plus several older artifacts (medicines/vendors/store_profile/
 * stock_batch table names, stock_quantity, purchase_orders.vendor_id,
 * sale_items.inventory_id, unscoped users.username) whose repair code has
 * since been removed once every real account was confirmed to postdate
 * them: for those, a finding here would mean an actual, currently-unhandled
 * problem on this device, not just a candidate for cleanup. Run from the
 * browser console (or Tauri's devtools) as
 * `await window.diagnoseLegacySchema()`; safe to run anywhere, including
 * production, since it never writes.
 *
 * `retirable` answers the question the raw `findings` list doesn't: for each
 * still-active legacy-repair step in schema-migrations.ts, is THIS device a
 * blocker to deleting it? `findings` reports problems present; retirement
 * needs the inverse verdict, per migration, so a human sweeping real devices
 * gets a direct yes/no instead of having to re-derive it from the findings
 * each time. A migration is only safe to delete once EVERY active device
 * reports `ok: true` — one device is never enough — and each entry's
 * `reason` spells out the caveats (notably that backfillStoreIdOnLegacyRows
 * re-runs every launch and so is also an ongoing safety net, not purely a
 * legacy-device repair). See docs/KNOWN_BUGS.md's deferred-work entry.
 */
export async function diagnoseLegacySchema(): Promise<{
  clean: boolean;
  findings: string[];
  retirable: Record<string, { ok: boolean; reason: string }>;
}> {
  if (!db) await initDatabase();
  const findings: string[] = [];
  // Per-migration retirement verdict (see the `retirable` note in the doc
  // comment above). Filled in alongside the read-only checks below — no
  // extra queries, and nothing here writes.
  let storeIdBackfillNeeded = false;

  const tableExistsLocal = async (table: string): Promise<boolean> => {
    const rows = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [table],
    );
    return rows.length > 0;
  };
  const columnExistsLocal = async (table: string, column: string): Promise<boolean> => {
    if (!(await tableExistsLocal(table))) return false;
    const rows = await query<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.some((r) => r.name === column);
  };

  for (const table of ["medicines", "vendors", "stock_batch", "store_profile"]) {
    if (await tableExistsLocal(table)) {
      findings.push(`Legacy table "${table}" still exists (should have been renamed).`);
    }
  }

  for (const table of [
    "stock_batches",
    "sale_items",
    "stock_movements",
    "purchase_order_items",
    "prescription_items",
    "return_items",
  ]) {
    if (await columnExistsLocal(table, "medicine_id")) {
      findings.push(`"${table}.medicine_id" still exists (should be product_id).`);
    }
  }

  if (await columnExistsLocal("sale_items", "inventory_id")) {
    findings.push('"sale_items.inventory_id" still exists (should be stock_batch_id).');
  }

  if (await columnExistsLocal("purchase_orders", "vendor_id")) {
    findings.push('"purchase_orders.vendor_id" still exists (should be supplier_id only).');
  }

  if (await columnExistsLocal("products", "stock_quantity")) {
    const unmigrated = await query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM products
       WHERE stock_quantity > 0 AND NOT EXISTS (
         SELECT 1 FROM stock_batches WHERE stock_batches.product_id = products.id AND stock_batches.batch_number = 'INITIAL'
       )`,
    );
    if ((unmigrated[0]?.cnt ?? 0) > 0) {
      findings.push(
        `"products.stock_quantity" column still exists with ${unmigrated[0].cnt} row(s) not yet migrated to stock_batches — the auto-repair for this was removed, so this now needs a manual fix.`,
      );
    } else {
      findings.push('"products.stock_quantity" column still exists but is fully migrated (dead column, not a blocker).');
    }
  }

  for (const table of STORE_SCOPED_TABLES) {
    if (await columnExistsLocal(table, "store_id")) {
      const missing = await query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE store_id IS NULL`,
      );
      if ((missing[0]?.cnt ?? 0) > 0) {
        storeIdBackfillNeeded = true;
        findings.push(`"${table}" has ${missing[0].cnt} row(s) with no store_id (backfill hasn't run or table predates it).`);
      }
    }
  }

  const usersTableInfo = await query<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
  );
  const usersSql = usersTableInfo[0]?.sql || "";
  if (usersSql && !/UNIQUE\s*\(\s*store_id\s*,\s*username\s*\)/i.test(usersSql)) {
    findings.push('"users" table is missing UNIQUE(store_id, username) (still on the old bare-username constraint).');
  }

  const poTableInfo = await query<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_orders'",
  );
  const poSql = poTableInfo[0]?.sql || "";
  const poSupplierIdStillNotNull = Boolean(poSql) && /supplier_id\s+TEXT\s+NOT\s+NULL/i.test(poSql);
  if (poSupplierIdStillNotNull) {
    findings.push('"purchase_orders.supplier_id" is still NOT NULL (Immediate Purchase without a supplier would fail).');
  }

  const retirable: Record<string, { ok: boolean; reason: string }> = {
    relaxPurchaseOrdersSupplierIdNullable: !poSql
      ? {
          ok: false,
          reason:
            "Inconclusive: no purchase_orders table found on this device, so the constraint can't be inspected.",
        }
      : poSupplierIdStillNotNull
        ? {
            ok: false,
            reason:
              "Still needed here: purchase_orders.supplier_id is NOT NULL, so this device has not run the rebuild yet.",
          }
        : {
            ok: true,
            reason:
              "Safe on this device: supplier_id is already nullable, so the rebuild is a no-op here (whether the DB was created after the 2026-08-29 ship date or was repaired by an earlier launch). Retire only once every active device reports ok.",
          },
    backfillStoreIdOnLegacyRows: storeIdBackfillNeeded
      ? {
          ok: false,
          reason:
            "Still needed here: rows with a NULL store_id exist in at least one store-scoped table (see findings).",
        }
      : {
          ok: true,
          reason:
            "No NULL store_id rows on this device right now. NOTE: unlike the purchase_orders rebuild, this backfill re-runs on every launch and so doubles as an ongoing safety net for any future code path that writes a row without a store_id — a clean snapshot today is necessary but NOT sufficient to retire it. Confirm no such write path exists before removing.",
        },
  };

  return { clean: findings.length === 0, findings, retirable };
}

if (typeof window !== "undefined") {
  window.diagnoseLegacySchema = diagnoseLegacySchema;
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.getDatabaseBinary = getDatabaseBinary;
  window.restoreDatabase = restoreDatabase;
  // Test-only escape hatch: e2e specs that exercise a paid-tier-gated module
  // (e.g. Expenses, Procurement — see use-feature-gate.ts's `!isFree`
  // fallbacks) share one checked-in free-tier fixture (e2e/.auth/test-db.bin)
  // with specs that deliberately rely on that same store being free-tier to
  // test LockedModuleOverlay itself. Rather than mutate the shared fixture
  // (which would break those other specs) or race the overlay's mount timing
  // by clicking fast, a spec can call this any time after logging in — before
  // the tier-gated content is needed, followed by a `page.reload()` — to
  // elevate its own isolated browser-context copy of the local DB — never the
  // checked-in fixture file, and inert outside development builds. See
  // e2e/fixtures.ts's `loginAsPaidTier`.
  window.__e2eSetSubscriptionTier = async (tier: string) => {
    await execute("UPDATE stores SET subscription_tier = ? WHERE id = ?", [
      tier,
      getActiveStoreId(),
    ]);
  };
}

// Every table a "wipe this device's local data" operation clears, shared by
// resetDatabase() and clearDatabaseForNewStore() so the two never drift
// apart again the way they previously did (sale_item_batches was missing
// from both, silently orphaning rows pointing at cleared sale_items/
// stock_batches). Deliberately excludes loyalty_tiers/loyalty_redemption_
// options/system_configs - store configuration, not transactional data -
// and stores/users, which only clearDatabaseForNewStore's own list adds.
const LOCAL_WIPE_TABLES = [
  "prescription_items",
  "prescriptions",
  "return_items",
  "returns",
  "sale_items",
  "sale_item_batches",
  "sales",
  "purchase_order_items",
  "purchase_orders",
  "customer_payments",
  "customers",
  "supplier_payments",
  "suppliers",
  "stock_audits",
  "stock_movements",
  "stock_batches",
  "products",
  "categories",
  "expenses",
  "audit_logs",
  "held_transactions",
  "loyalty_transactions",
  "requested_products",
  "feedback",
  "payment_accounts",
  "_sync_state",
  "_sync_queue",
];

/**
 * Truncates all tables except system-critical ones
 */
export async function resetDatabase(): Promise<void> {
  if (!db) await initDatabase();

  const tablesToClear = LOCAL_WIPE_TABLES;

  for (const table of tablesToClear) {
    try {
      if (isTauri()) {
        await execute(`DELETE FROM ${table}`);
      } else {
        db.run(`DELETE FROM ${table}`);
      }
    } catch (_e) {
      console.warn(`Failed to clear table ${table}`, _e);
    }
  }

  if (!isTauri()) {
    await saveDatabase();
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem("last_sync_time");
    window.location.reload();
  }
}

/**
 * Wipes all local store tables (including users and stores) without page reload.
 * Used when linking a new cloud store on an already-configured device.
 */
export async function clearDatabaseForNewStore(): Promise<void> {
  if (!db) await initDatabase();

  const tablesToClear = [...LOCAL_WIPE_TABLES, "stores", "users"];

  for (const table of tablesToClear) {
    try {
      if (isTauri()) {
        await execute(`DELETE FROM ${table}`);
      } else {
        db.run(`DELETE FROM ${table}`);
      }
    } catch (_e) {
      console.warn(`Failed to clear table ${table} during store transition`, _e);
    }
  }

  if (!isTauri()) {
    await saveDatabase();
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem("last_sync_time");
  }
}

export async function logAction(
  action: string,
  table: string,
  recordId: string,
  details?: Record<string, unknown>,
  // Mirrors assertStoreOwnership's overrideStoreId (base-helpers.ts): the
  // one real caller that needs it is stock-transfers.ts's transferStock(),
  // which legitimately writes rows in two different stores within one
  // transaction. Without this, every audit-log row for a transfer's writes
  // was attributed to whatever store the UI happened to have active rather
  // than the source/destination store the write actually belongs to.
  overrideStoreId?: string,
  // Ties every row one multi-step operation writes (e.g. everything a
  // single sale touches) together for the Activity Log to collapse into
  // one entry - see correlation_id's schema-migrations.ts comment.
  correlationId?: string,
) {
  if (!db) return;
  const id = generateId();
  const now = new Date().toISOString();
  const storeId = overrideStoreId ?? getActiveStoreId();

  await execute(
    `INSERT INTO audit_logs (id, user_id, store_id, action, table_name, record_id, details, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      currentUser?.id || null,
      storeId,
      action,
      table,
      recordId,
      details ? JSON.stringify(details) : null,
      correlationId || null,
      now,
    ],
  );

  // Enqueue log action into the sync queue so it gets synced to the server
  const record = {
    id,
    user_id: currentUser?.id || null,
    store_id: storeId,
    action,
    table_name: table,
    record_id: recordId,
    details: details ? JSON.stringify(details) : null,
    correlation_id: correlationId || null,
    created_at: now,
    updated_at: now,
  };

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ["audit_logs", id, "INSERT", JSON.stringify(record), now],
  );
}

export function getDatabase(): Database | null {
  return db;
}

export async function getSystemConfig<T = unknown>(key: string): Promise<T | null> {
  const result = await query<{ value: string }>(
    "SELECT value FROM system_configs WHERE key = ?",
    [key],
  );
  if (result.length > 0) {
    try {
      return JSON.parse(result[0].value);
    } catch (_e) {
      return null;
    }
  }
  return null;
}

export async function setSystemConfig(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  const valueStr = JSON.stringify(value);

  const existing = await query("SELECT key FROM system_configs WHERE key = ?", [
    key,
  ]);
  if (existing.length > 0) {
    await execute(
      "UPDATE system_configs SET value = ?, updated_at = ? WHERE key = ?",
      [valueStr, now, key],
    );
  } else {
    await execute(
      "INSERT INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)",
      [key, valueStr, now],
    );
  }
}
