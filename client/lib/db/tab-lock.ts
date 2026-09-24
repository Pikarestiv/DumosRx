/**
 * Single-writer-tab coordination for the web/PWA build (docs/KNOWN_BUGS.md
 * C1). sql.js keeps one independent in-memory database per browser tab and
 * persists by overwriting a single shared IndexedDB key wholesale, with no
 * version/CAS check — two tabs open at once can silently destroy each
 * other's committed writes, with no error or retry path. This module elects
 * exactly one tab as the writer via the Web Locks API; every other tab is
 * read-only until the writer tab closes (or reloads), at which point the
 * next queued tab is promoted and re-hydrates from whatever the writer last
 * persisted.
 *
 * Not used on Tauri (desktop/mobile): that build talks to a real file-backed
 * SQLite database via the Tauri SQL plugin, which has its own WAL-mode
 * concurrency story and isn't affected by this in-memory-per-tab problem.
 */

const LOCK_NAME = "dumosrx-db-writer";

// Defaults to true (not false) deliberately: most unit tests inject a
// database directly via __setDatabaseForTesting() and call execute()/
// transaction() without ever going through initDatabase()/initWriterLock(),
// so they'd otherwise be silently treated as read-only and every write would
// throw. Production code only ever sees this flip to false via
// initWriterLock() itself, when a real contending tab is detected.
let writerTab = true;

const writerChangeListeners = new Set<(isWriter: boolean) => void>();
const promotionFailedListeners = new Set<() => void>();

function setWriterTab(value: boolean): void {
  if (writerTab === value) return;
  writerTab = value;
  for (const fn of writerChangeListeners) fn(value);
}

export function isWriterTab(): boolean {
  return writerTab;
}

/** Lets UI (e.g. DatabaseProvider's read-only banner) react to this tab's
 * writer status changing, without polling isWriterTab(). */
export function onWriterTabChange(fn: (isWriter: boolean) => void): () => void {
  writerChangeListeners.add(fn);
  return () => writerChangeListeners.delete(fn);
}

/** Fires when this tab won the lock on promotion but refused to become
 * writer because rehydrating from IndexedDB failed (see initWriterLock's
 * promoted branch below) - this tab is permanently stuck read-only until
 * reloaded, since the lock was released back rather than held on stale
 * data. Lets the UI tell the user to reload, rather than leaving them on a
 * silently-still-read-only tab with no explanation. */
export function onPromotionFailed(fn: () => void): () => void {
  promotionFailedListeners.add(fn);
  return () => promotionFailedListeners.delete(fn);
}

// Holds the lock (or the queued request) open for as long as this tab lives.
// The browser releases a Web Lock automatically when the holding document is
// destroyed (navigation, close, crash) - this promise is never meant to
// resolve on its own, so no beforeunload plumbing is needed to release it.
function holdForever(): Promise<void> {
  return new Promise(() => {});
}

/**
 * Call once, right after this tab's local database is first loaded from
 * IndexedDB. Decides whether this tab is the writer (no contending tab holds
 * the lock yet) or read-only (another tab already does), and if read-only,
 * queues for the lock so this tab is promoted the moment the current writer
 * releases it - calling `onPromoted` first so it can re-read whatever the
 * outgoing writer last persisted before this tab starts writing itself.
 *
 * The returned promise resolves as soon as this tab's *initial* role
 * (writer or read-only) is known - it does not wait for an eventual
 * promotion, which may never happen or may take as long as the current
 * writer tab stays open. Callers (initDatabase()) can safely await it before
 * returning, since the `ifAvailable` check below never blocks on another
 * tab's lifetime.
 *
 * `onPromoted` must resolve `true` only if it actually caught this tab's
 * local database up to what the outgoing writer last persisted - resolving
 * `false` (or rejecting) means this tab releases the lock it was just
 * granted WITHOUT ever becoming writer, rather than risk overwriting the
 * shared IndexedDB snapshot with this tab's now-known-stale copy the next
 * time it saves (exactly the C1 data loss this module exists to prevent,
 * just re-opened on the rehydrate-failure path instead of the no-election-
 * at-all path). The lock then sits released - a differently-timed retry
 * (e.g. the user reloading this tab) can still win it later; see
 * onPromotionFailed() for how the UI is told to prompt that.
 */
export function initWriterLock(onPromoted: () => Promise<boolean>): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    // Web Locks API unsupported (very old browser - it's shipped in every
    // major browser since early 2022). Can't coordinate across tabs at all,
    // so fall back to pre-fix behavior (every tab writes) rather than
    // wrongly locking every tab but one out of an app they can't coordinate.
    setWriterTab(true);
    return Promise.resolve();
  }

  return new Promise<void>((resolveInitialRole) => {
    navigator.locks
      .request(LOCK_NAME, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (lock) {
          setWriterTab(true);
          resolveInitialRole();
          return holdForever();
        }

        // Another tab already holds the lock - read-only until promoted.
        setWriterTab(false);
        resolveInitialRole();
        await navigator.locks.request(LOCK_NAME, { mode: "exclusive" }, async () => {
          let rehydrated = false;
          try {
            rehydrated = await onPromoted();
          } catch (err) {
            console.error("[DB] Rehydrate-on-promotion threw", err);
          }
          if (!rehydrated) {
            console.error(
              "[DB] Refusing to promote this tab to writer: rehydrating from IndexedDB failed. Reload this tab to retry.",
            );
            for (const fn of promotionFailedListeners) fn();
            return; // release the lock without ever writing from this tab
          }
          setWriterTab(true);
          return holdForever();
        });
      })
      .catch((err) => {
        console.error(
          "[DB] Writer-lock coordination failed; treating this tab as the writer",
          err,
        );
        setWriterTab(true);
        resolveInitialRole();
      });
  });
}
