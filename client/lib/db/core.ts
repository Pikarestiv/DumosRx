/**
 * Core Database Logic
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { APP_NAME } from "@/lib/constants";
import { APP_EVENTS, emitAppEvent } from "@/lib/events";
import { del, get, set } from "idb-keyval";
/* eslint-disable max-lines */
import { SCHEMA_SQL } from "./schema";
import { isDedupableAuditAction } from "./audit-actions";
import {
  STORE_SCOPED_TABLES,
  makeTauriAdapter,
  makeSqlJsAdapter,
  runSchemaMigrations,
} from "./schema-migrations";
import {
  initWriterLock,
  isWriterTab,
  onWriterTabChange,
  onPromotionFailed,
  requestWriterTakeover,
  stealWriterLock,
} from "./tab-lock";
import {
  clearLastSyncTime,
  clearRecentUsers,
  STORAGE_KEYS,
  type StorageKey,
} from "@/lib/storage-keys";

export { isWriterTab, onWriterTabChange, onPromotionFailed };

/**
 * UI entry point for the graceful writer handoff (tab-lock.ts's
 * `requestWriterTakeover()`): asks the current writer to force-save and drop
 * to read-only. Callers should offer `forceWriterTakeover()` on "timeout"
 * (unresponsive holder) or "unsupported" (no BroadcastChannel).
 */
export function requestWriterHandoff(): Promise<"acked" | "timeout" | "unsupported"> {
  return requestWriterTakeover();
}

/**
 * Fallback for `requestWriterHandoff()` timing out or being unsupported:
 * steals the Web Lock, rehydrating first. The outgoing holder's unsaved
 * changes are lost here, unlike the graceful path — see `stealWriterLock()`.
 */
export function forceWriterTakeover(): Promise<boolean> {
  return stealWriterLock(rehydrateFromIndexedDb);
}

// Dual-backend handle (sql.js vs @tauri-apps/plugin-sql), deliberately
// untyped rather than a misleading union of two incompatible shapes.
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

// Scopes React Query cache keys so a user switch can't read the outgoing
// user's cache slots (lib/query-keys.ts's `resource`).
export function getCurrentUserId(): string | null {
  return currentUser?.id ?? null;
}

// The store every domain query scopes to; a staff member's fixed store_id
// always wins over switcher state. Set from store-context.tsx.
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

/** A short, human-scannable unique id for display fields people read
 * (receipt/transaction numbers). 48 random bits: short enough to print,
 * with enough headroom that collisions need tens of millions of rows. */
export function generateShortId(): string {
  return generateId().split("-").slice(0, 2).join("").toUpperCase();
}

// STORE_SCOPED_TABLES and the schema-migration machinery now live in
// ./schema-migrations; re-exported here so existing importers of
// `STORE_SCOPED_TABLES` from "./core" keep working unchanged.
export { STORE_SCOPED_TABLES };


// Shared so concurrent callers don't each register a writer-lock request
// (client/AGENTS.md, "One connection, one writer").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initDatabasePromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initDatabase(): Promise<any> {
  if (db) return Promise.resolve(db);
  if (!initDatabasePromise) {
    initDatabasePromise = initDatabaseInternal().finally(() => {
      initDatabasePromise = null;
    });
  }
  return initDatabasePromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function initDatabaseInternal(): Promise<any> {
  if (db) return db;

  if (isTauri()) {
    try {
      const sqlPlugin = await import("@tauri-apps/plugin-sql");
      // Covers both ESM default and CJS-style named export; which one the
      // plugin resolves to isn't guaranteed across bundler versions.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Database = sqlPlugin.default || (sqlPlugin as any).Database;

      db = await Database.load("sqlite:dumosrx.db");

      // Required for the plugin's pooled connections — see
      // client/AGENTS.md, "One connection, one writer" (Tauri PRAGMAs).
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

    // Must run, and be awaited, BEFORE the migrations below — see
    // client/AGENTS.md, "One connection, one writer".
    await initWriterLock(rehydrateFromIndexedDb, saveDatabase);

    const webAdapter = makeSqlJsAdapter(db);

    await runSchemaMigrations(webAdapter, isWriterTab() ? saveDatabase : undefined);

    installExitFlush();

    return db;
  } catch (err) {
    console.error("[DB] Failed to initialize database:", err);
    throw err;
  }
}

/**
 * Re-reads the shared IndexedDB snapshot into `db`. Called by tab-lock.ts
 * once per tab, at promotion to writer. Returns `true` after a successful
 * rehydrate or when no snapshot exists at all; `false` only on a real read
 * failure, which tab-lock.ts treats as "refuse to promote". Deliberately
 * does not re-run schema migrations. See client/AGENTS.md, "One connection,
 * one writer".
 */
async function rehydrateFromIndexedDb(): Promise<boolean> {
  if (!SQL) return false;
  let savedData: Uint8Array | undefined;
  try {
    savedData = await get<Uint8Array>(`${APP_NAME.toLowerCase()}_db`);
  } catch (err) {
    console.error("[DB] Failed to read IndexedDB while rehydrating after writer-lock promotion", err);
    return false;
  }
  if (!savedData) return true;
  // Reserve the connection-wide lock before swapping `db` out, or an
  // in-flight operation resumes against a closed handle.
  const { previous, release } = reserveDbSlot();
  try {
    await previous;
    const fresh = new SQL.Database(savedData);
    fresh.run(SCHEMA_SQL);
    try {
      db?.close?.();
    } catch {
      // Best-effort; a failed close of the discarded instance is harmless.
    }
    db = fresh;
    return true;
  } catch (err) {
    console.error("[DB] Failed to rehydrate database after writer-lock promotion", err);
    return false;
  } finally {
    release();
  }
}

// A persistent save failure would otherwise warn on every single write.
const SAVE_FAILURE_NOTICE_INTERVAL_MS = 5 * 60 * 1000;
let lastSaveFailureNoticeAt = 0;

let saveChain: Promise<void> = Promise.resolve();
let queuedExport: { data: Uint8Array; epoch: number } | null = null;
let savedWriteEpoch = 0;

export function saveDatabase(): Promise<void> {
  if (!db) return Promise.resolve();

  queuedExport = { data: db.export(), epoch: writeEpoch };

  saveChain = saveChain.then(async () => {
    const pending = queuedExport;
    queuedExport = null;
    if (!pending) return;
    await persistDatabaseExport(pending.data);
    savedWriteEpoch = pending.epoch;
  });

  return saveChain;
}

async function persistDatabaseExport(data: Uint8Array): Promise<void> {
  await set(`${APP_NAME.toLowerCase()}_db`, data).catch(err => {
    // Surfaced as an app event, not console-only — see client/AGENTS.md,
    // "One connection, one writer" (persistence).
    console.error("Failed to save DB to IndexedDB", err);
    if (typeof window !== "undefined") {
      const now = Date.now();
      if (now - lastSaveFailureNoticeAt > SAVE_FAILURE_NOTICE_INTERVAL_MS) {
        lastSaveFailureNoticeAt = now;
        emitAppEvent(APP_EVENTS.dbSaveFailed, { error: err });
      }
    }
  });
}

export function hasUnpersistedWrites(): boolean {
  return queuedExport !== null || savedWriteEpoch !== writeEpoch;
}

let exitFlushInstalled = false;

export function installExitFlush(): void {
  if (exitFlushInstalled || typeof window === "undefined" || isTauri()) return;
  exitFlushInstalled = true;

  const flush = () => {
    if (!db || !isWriterTab() || !hasUnpersistedWrites()) return;
    void saveDatabase();
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Test-only: resets the module-level save chain and exit-flush registration
 * so each test starts from a clean persistence state. */
export function __resetExitFlushForTesting(): void {
  exitFlushInstalled = false;
  saveChain = Promise.resolve();
  queuedExport = null;
  savedWriteEpoch = 0;
  writeEpoch = 0;
}

/** Test-only: marks the in-memory database as having unpersisted writes,
 * without going through execute()'s own save. */
export function __bumpWriteEpochForTesting(): void {
  bumpWriteEpoch();
}

// Set while a transaction() block is running; read by query()'s yield guard
// and execute()'s deferred-save branch.
let inTransaction = false;

// Lets a composed helper tell whether it must open its own transaction() or
// is already inside one (nesting deadlocks — see transaction()).
export function isInTransaction(): boolean {
  return inTransaction;
}

// Rows query() fetches before yielding a tick; high enough that typical
// queries never pay the setTimeout round-trip.
const QUERY_YIELD_INTERVAL = 200;

/**
 * Bumped by every write, so a query() suspended at a yield point can tell
 * its read may have been torn. See client/AGENTS.md, "One connection, one
 * writer".
 */
let writeEpoch = 0;

function bumpWriteEpoch(): void {
  // Wrap well below MAX_SAFE_INTEGER; only equality across one query matters.
  writeEpoch = (writeEpoch + 1) % 0xffffffff;
}

// Must stay comfortably above MAX_MISUSE_RETRIES, which shares this budget
// (client/AGENTS.md, "One connection, one writer").
const QUERY_TORN_READ_ATTEMPTS = 6;

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

  // Holds the connection-wide lock for this call's whole duration, yields
  // included; a read inside a transaction must not reserve its own slot.
  const startedOutsideTransaction = !inTransaction;
  const slot = startedOutsideTransaction ? reserveDbSlot() : null;
  if (slot) await slot.previous;

  try {
    // Defence-in-depth behind the lock; capped so a genuinely different
    // failure still surfaces.
    const MAX_MISUSE_RETRIES = 2;
    let closedRetryCount = 0;
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
          // sql.js is main-thread, so a big result set blocks painting.
          // Never yield inside a transaction (uncommitted state).
          if (!inTransaction && rowCount % QUERY_YIELD_INTERVAL === 0) {
            yielded = true;
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
        stmt.free();

        // Kept in case a future caller bypasses the lock; under it,
        // writeEpoch simply never changes mid-read.
        if (
          yielded &&
          writeEpoch !== epochAtStart &&
          attempt < QUERY_TORN_READ_ATTEMPTS - 1
        ) {
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
        // All observed spellings of one race — see client/AGENTS.md, "One
        // connection, one writer" (the misuse-class retry).
        if (closedRetryCount < MAX_MISUSE_RETRIES && /closed|finalized|bad parameter|api misuse|allocation failed/i.test(message)) {
          closedRetryCount++;
          continue;
        }
        throw err;
      }
    }

    // Unreachable (the loop above always either returns or throws), but
    // TypeScript can't see that from a for-loop with a fixed bound.
    return [];
  } finally {
    slot?.release();
  }
}

// Registered by base-helpers.ts (importing it back here would be a cycle);
// batched per transaction — see client/AGENTS.md, "One connection, one writer".
let invalidateTablesFn: ((tables: Iterable<string>) => void) | null = null;
let pendingInvalidations: Set<string> | null = null;

export function registerInvalidateTablesFn(
  fn: (tables: Iterable<string>) => void,
): void {
  invalidateTablesFn = fn;
}

// Drives SyncIndicator's instant-sync mode. A Set (several indicators mount
// at once) and it passes the changed tables, not just "something changed".
const syncQueueChangeListeners = new Set<(tables: string[]) => void>();

export function addSyncQueueChangeListener(
  fn: (tables: string[]) => void,
): () => void {
  syncQueueChangeListeners.add(fn);
  return () => syncQueueChangeListeners.delete(fn);
}

function notifySyncQueueChangeListeners(tables: Iterable<string>): void {
  const tableList = Array.from(tables);
  for (const fn of syncQueueChangeListeners) fn(tableList);
}

export function queueTableInvalidation(table: string): void {
  if (inTransaction && pendingInvalidations) {
    pendingInvalidations.add(table);
  } else {
    invalidateTablesFn?.([table]);
    notifySyncQueueChangeListeners([table]);
  }
}

// A tab that lost the single-writer election must not write at all (C1 in
// docs/KNOWN_BUGS.md); the event lets the UI explain why.
function assertWritable(): void {
  if (isTauri() || isWriterTab()) return;
  if (typeof window !== "undefined") {
    emitAppEvent(APP_EVENTS.dbReadOnlyWriteBlocked);
  }
  throw new Error(
    "This tab is read-only because DumosRx is already open in another tab or window. Switch to that tab, or close it, to make changes here.",
  );
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

  if (inTransaction) {
    // The enclosing transaction already holds the slot, and saves once in
    // its finally block; reserving again here would deadlock.
    assertWritable();
    db.run(sql, params);
    bumpWriteEpoch();
    return;
  }

  // The shared lock keeps this write from landing mid-read.
  const { previous, release } = reserveDbSlot();
  try {
    await previous;
    assertWritable();
    db.run(sql, params);
    bumpWriteEpoch();
    void saveDatabase();
  } finally {
    release();
  }
}

// Serializes every transaction() so BEGIN/COMMIT pairs can never interleave;
// nesting is unsupported and deadlocks (client/AGENTS.md, "One connection").
let transactionQueue: Promise<void> = Promise.resolve();

/**
 * Reserves the next slot in the shared connection-wide FIFO queue and
 * returns this caller's `previous`/`release` pair. Used by transaction(),
 * execute() and query(). Reserves synchronously, before the caller awaits
 * anything. See client/AGENTS.md, "One connection, one writer".
 */
function reserveDbSlot(): { previous: Promise<void>; release: () => void } {
  const previous = transactionQueue;
  let release!: () => void;
  transactionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { previous, release };
}

/**
 * Waits for every transaction() reserved so far to commit or roll back.
 * Await this before a bare query() whose rows leave the device (see
 * `getPendingSyncItems()`); it narrows, but does not close, the window.
 * See client/AGENTS.md, "One connection, one writer".
 */
export async function awaitSettledTransactions(): Promise<void> {
  await transactionQueue;
}

/**
 * Runs `fn` inside a real SQL transaction so a multi-statement operation
 * either fully applies or fully rolls back. Every write inside `fn` must go
 * through query()/execute() (and so insert()/update()/etc.) against the same
 * `db` handle to participate in it.
 *
 * Do NOT call this from inside another transaction()'s `fn`: it deadlocks by
 * design. If BEGIN itself fails, `fn` runs without atomicity rather than
 * being blocked. See client/AGENTS.md, "One connection, one writer", for
 * both, including the vendored Tauri plugin's `.max_connections(1)` cap.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const { previous, release: releaseNext } = reserveDbSlot();

  try {
    // Committed or rolled back: a failure ahead of us must not block us.
    await previous;

    if (!db) {
      await initDatabase();
    }
    if (!db) {
      // Database unavailable; let fn() surface whatever error it hits.
      return await fn();
    }

    assertWritable();

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
        notifySyncQueueChangeListeners(tables);
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

// Not exhaustive — just enough to catch another app's valid .db/.sqlite,
// not only outright garbage.
const RESTORE_SANITY_CHECK_TABLES = ["users", "stores", "products", "sales"];

/**
 * Overwrites the current database with provided binary data: sql.js (web)
 * only — on desktop/mobile use restoreDatabaseFromFile(), or `db` is
 * silently disconnected from the file Tauri manages. Returns whether the
 * pre-restore snapshot succeeded, so the caller can warn that
 * restorePreRestoreSnapshot() will not be available. Also runs the
 * cold-start schema pass (SCHEMA_SQL + runSchemaMigrations) against the
 * restored database before persisting it, so a backup taken on an older
 * app version comes up on the current schema immediately. See
 * client/AGENTS.md, "Backup, restore, wipes and diagnostics".
 */
export async function restoreDatabase(binaryData: Uint8Array): Promise<{ snapshotSucceeded: boolean }> {
  if (isTauri()) {
    throw new Error(
      "restoreDatabase() is web-only; use restoreDatabaseFromFile() on desktop/mobile.",
    );
  }
  assertWritable();
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }

  // Local variable, not `db`: a malformed file throws here with the live
  // database still fully intact.
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
  // Reserves the same connection-wide lock query()/execute()/transaction()
  // use (see reserveDbSlot()), for the same reason rehydrateFromIndexedDb()
  // does: nothing in flight may resume against the outgoing `db` once it has
  // been close()d, and nothing may read the restored one until its schema
  // pass below has finished.
  const { previous, release } = reserveDbSlot();
  try {
    await previous;

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

    // A backup taken on an older app version carries that version's schema,
    // which leaves the live process running against a database missing
    // whatever tables/columns have shipped since (the permission_groups
    // drift traced in docs/KNOWN_BUGS.md) until the next cold start. Apply
    // the exact pass initDatabaseInternal() applies to an existing database:
    // CREATE TABLE IF NOT EXISTS plus the idempotent migrations, both
    // additive against the restored rows.
    db.run(SCHEMA_SQL);
    await runSchemaMigrations(makeSqlJsAdapter(db));

    await saveDatabase();
  } finally {
    release();
  }
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
 * Last-resort recovery for a local database that cannot be opened at all
 * (web/PWA only): snapshots the blob to `dumosrx_db_pre_reset_backup`, then
 * deletes the live key so the next boot starts fresh and re-pulls.
 * Deliberately does not touch `db` — it runs on the init-failure screen.
 */
export async function discardLocalDatabaseBlob(): Promise<{ backedUp: boolean }> {
  if (isTauri()) return { backedUp: false };

  const key = `${APP_NAME.toLowerCase()}_db`;
  let backedUp = false;
  try {
    const existing = await get<Uint8Array>(key);
    if (existing) {
      await set(`${key}_pre_reset_backup`, existing);
      backedUp = true;
    }
  } catch (err) {
    console.error("[DB] Failed to snapshot the local database before reset", err);
  }

  await del(key);
  return { backedUp };
}

/**
 * Desktop/mobile-only backup: native save dialog, then `VACUUM INTO`, which
 * stays coherent even if writes land during it (a raw file copy would not).
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

  // VACUUM INTO won't reliably take a bound parameter here, and a quote in
  // a folder name would break raw interpolation.
  const escapedPath = destPath.replace(/'/g, "''");
  await db.execute(`VACUUM INTO '${escapedPath}'`);
  return { success: true, path: destPath };
}

// The SQLite format's own magic header: first 16 bytes of any real .db.
const SQLITE_FILE_HEADER = "SQLite format 3\0";

/**
 * Desktop/mobile-only restore: native open dialog, header validation,
 * snapshot of the live file, close, then overwrite `dumosrx.db`. The caller
 * must reload the app afterwards so initDatabase() reconnects. See
 * client/AGENTS.md, "Backup, restore, wipes and diagnostics".
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

  // Validate BEFORE touching the live connection or file at all.
  const candidateBytes = await readFile(sourcePath);
  const header = new TextDecoder().decode(candidateBytes.slice(0, 16));
  if (header !== SQLITE_FILE_HEADER) {
    throw new Error("This file doesn't look like a valid SQLite database.");
  }

  const liveDbPath = await join(await appDataDir(), "dumosrx.db");

  if (db) {
    try {
      // WAL is enabled, so the snapshot below would otherwise miss the most
      // recent writes still sitting in the -wal sidecar.
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
      // Never overwrite past a failed close: the WAL sidecars can replay
      // stale pages over the restored file on the next open.
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
 * Read-only audit of legacy schema artifacts on this device. Run as
 * `await window.diagnoseLegacySchema()` from the console; safe anywhere,
 * including production, since it never writes. `findings` lists problems
 * present; `retirable` gives the per-migration verdict on whether THIS
 * device blocks deleting it. See client/AGENTS.md, "Backup, restore, wipes
 * and diagnostics", and docs/KNOWN_BUGS.md's deferred-work entry.
 */
export async function diagnoseLegacySchema(): Promise<{
  clean: boolean;
  findings: string[];
  retirable: Record<string, { ok: boolean; reason: string }>;
}> {
  if (!db) await initDatabase();
  const findings: string[] = [];
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
  // Elevates only this browser context's copy of the DB, never the
  // checked-in fixture. See e2e/fixtures.ts's `loginAsPaidTier`.
  window.__e2eSetSubscriptionTier = async (tier: string) => {
    await execute("UPDATE stores SET subscription_tier = ? WHERE id = ?", [
      tier,
      getActiveStoreId(),
    ]);
  };
}

// Shared by resetDatabase() and clearDatabaseForNewStore() so the two can't
// drift (client/AGENTS.md, "Backup, restore, wipes and diagnostics").
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
  "_pending_stock_deltas",
  "_sync_conflicts",
];

/**
 * Truncates all tables except system-critical ones
 */
export async function resetDatabase(): Promise<void> {
  if (!db) await initDatabase();
  assertWritable();

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
    clearLastSyncTime();
    window.location.reload();
  }
}

/**
 * Wipes all local store tables (including users and stores) without page reload.
 * Used when linking a new cloud store on an already-configured device.
 */
export async function clearDatabaseForNewStore(): Promise<void> {
  if (!db) await initDatabase();
  assertWritable();

  const tablesToClear = [
    ...LOCAL_WIPE_TABLES,
    ...STORE_SCOPED_TABLES.filter((table) => !LOCAL_WIPE_TABLES.includes(table)),
    "stores",
    "users",
  ];

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
    clearLastSyncTime();
    // The login picker reads this cache, not `users` - see client/AGENTS.md.
    clearRecentUsers();
    clearAccountScopedCaches();
  }
}

/**
 * Caches describing this device's relationship with the account/store being
 * replaced, as opposed to the device itself. Device-level keys (deviceId,
 * apiUrl, UI preferences, and especially loginLockout, which is a
 * brute-force control) are deliberately absent — see client/AGENTS.md, A-153.
 */
function clearAccountScopedCaches(): void {
  const accountScoped: StorageKey[] = [
    STORAGE_KEYS.suggestions,
    STORAGE_KEYS.syncUniqueSkipCounts,
    STORAGE_KEYS.syncHealthDeficitState,
    STORAGE_KEYS.lastSyncHealthCheck,
    STORAGE_KEYS.orphanRequeueMarker,
    STORAGE_KEYS.lastAuditLogPrune,
    STORAGE_KEYS.posCart,
  ];

  for (const key of accountScoped) {
    try {
      localStorage.removeItem(key);
    } catch (_e) {
      console.warn(`Failed to clear ${key} during store transition`, _e);
    }
  }
}

export async function logAction(
  action: string,
  table: string,
  recordId: string,
  details?: Record<string, unknown>,
  // Mirrors assertStoreOwnership's overrideStoreId; needed by transferStock().
  overrideStoreId?: string,
  // Groups one multi-step operation's rows in the Activity Log.
  correlationId?: string,
  // Attributes the row to someone other than the locally logged-in user. Only
  // for an actor the SERVER knows but this device does not — an admin running
  // a repair from an on-till inspection session. SyncController backfills
  // `user_id` from the sync token whenever the id is missing or unknown to it,
  // so leaving this unset makes the server's record name the token's owner
  // (typically the store owner) as the actor.
  actorId?: string,
) {
  if (!db) return;
  const now = new Date().toISOString();
  const storeId = overrideStoreId ?? getActiveStoreId();
  const detailsJson = details ? JSON.stringify(details) : null;

  // Dedup path — see client/AGENTS.md, "`logAction()` and audit-log dedup".
  if (isDedupableAuditAction(action)) {
    const existing = await query<{ id: string; occurrence_count: number | null }>(
      `SELECT id, occurrence_count FROM audit_logs
       WHERE action = ? AND table_name = ? AND record_id = ? AND store_id IS ?
         AND _synced = 0 AND (_deleted = 0 OR _deleted IS NULL)
       ORDER BY created_at DESC LIMIT 1`,
      [action, table, recordId, storeId],
    );

    if (existing.length > 0) {
      const row = existing[0];
      const newCount = (row.occurrence_count || 1) + 1;

      await execute(
        `UPDATE audit_logs SET occurrence_count = ?, last_occurred_at = ?, details = ?, updated_at = ? WHERE id = ?`,
        [newCount, now, detailsJson, now, row.id],
      );

      // Rewrite the pending INSERT payload in place, never queue a second
      // entry; a push that already cleared it makes this a harmless no-op.
      const queued = await query<{ id: number; payload: string }>(
        `SELECT id, payload FROM _sync_queue WHERE table_name = 'audit_logs' AND record_id = ? AND operation = 'INSERT' ORDER BY id DESC LIMIT 1`,
        [row.id],
      );
      if (queued.length > 0) {
        try {
          const payload = JSON.parse(queued[0].payload);
          payload.occurrence_count = newCount;
          payload.last_occurred_at = now;
          payload.details = detailsJson;
          payload.updated_at = now;
          await execute(`UPDATE _sync_queue SET payload = ? WHERE id = ?`, [
            JSON.stringify(payload),
            queued[0].id,
          ]);
        } catch (e) {
          console.error("Failed to update queued audit-log payload for dedup", e);
        }
      }
      return;
    }
  }

  const id = generateId();

  await execute(
    `INSERT INTO audit_logs (id, user_id, store_id, action, table_name, record_id, details, correlation_id, occurrence_count, last_occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      actorId ?? currentUser?.id ?? null,
      storeId,
      action,
      table,
      recordId,
      detailsJson,
      correlationId || null,
      1,
      now,
      now,
    ],
  );

  // Enqueue log action into the sync queue so it gets synced to the server
  const record = {
    id,
    user_id: actorId ?? currentUser?.id ?? null,
    store_id: storeId,
    action,
    table_name: table,
    record_id: recordId,
    details: detailsJson,
    correlation_id: correlationId || null,
    occurrence_count: 1,
    last_occurred_at: now,
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
