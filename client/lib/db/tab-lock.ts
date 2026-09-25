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
const HANDOFF_CHANNEL_NAME = "dumosrx-db-writer-handoff";
const TAKEOVER_ACK_TIMEOUT_MS = 4000;

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

type HandoffMessage =
  | { type: "takeover-request"; requestId: string }
  | { type: "takeover-ack"; requestId: string }
  | { type: "steal-notice" };

// Cross-tab channel used only for the graceful writer handoff below - never
// for the election itself, which stays entirely on the Web Locks API. Lazily
// created (and only if BroadcastChannel exists) so environments without it
// just fall back to "requestWriterTakeover always times out", not a throw.
let handoffChannel: BroadcastChannel | null = null;
function getHandoffChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!handoffChannel) {
    handoffChannel = new BroadcastChannel(HANDOFF_CHANNEL_NAME);
    // navigator.locks' {steal: true} revokes a lock without notifying its
    // holder - this is the only way a merely-slow (not dead) old writer
    // finds out it lost the election before its next write.
    handoffChannel.addEventListener("message", (event: MessageEvent<HandoffMessage>) => {
      if (event.data?.type === "steal-notice") setWriterTab(false);
    });
  }
  return handoffChannel;
}

function generateRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

// Set once per tab by initWriterLock() - whatever it is, both the natural
// writer-hold path and stealWriterLock()'s steal path reuse the same
// callback, so a takeover requested while this tab is the writer always
// forces the same save function regardless of which path granted the lock.
let forceSaveForHandoff: (() => Promise<void>) | null = null;

/** Holds a granted writer lock open (like holdForever()) but also listens
 * for a takeover request from another tab. On request: force-saves via
 * `forceSaveForHandoff` (so the requester never rehydrates before this
 * tab's own last changes landed in IndexedDB), acks, drops this tab to
 * read-only, then resolves - which returns control to the Web Locks
 * callback that's holding this open, releasing the lock for real. */
function holdUntilTakeover(): Promise<void> {
  const channel = getHandoffChannel();
  if (!channel) return holdForever();

  return new Promise<void>((resolve) => {
    const handler = (event: MessageEvent<HandoffMessage>) => {
      const msg = event.data;
      if (!msg || msg.type !== "takeover-request") return;
      void (async () => {
        try {
          await forceSaveForHandoff?.();
        } catch (err) {
          console.error("[DB] Forced save before writer handoff failed", err);
        }
        channel.postMessage({ type: "takeover-ack", requestId: msg.requestId } satisfies HandoffMessage);
        setWriterTab(false);
        channel.removeEventListener("message", handler);
        resolve();
      })();
    };
    channel.addEventListener("message", handler);
  });
}

/** Idempotent promotion shared by the natural (queued-lock) promotion path
 * and stealWriterLock() - guards against a tab getting promoted twice (once
 * via each path racing) by short-circuiting once writerTab is already true.
 * See initWriterLock's doc comment for what `onPromoted` must guarantee. */
async function promoteToWriter(onPromoted: () => Promise<boolean>): Promise<boolean> {
  if (writerTab) return true;
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
    return false;
  }
  setWriterTab(true);
  return true;
}

// Lets stealWriterLock() cancel this tab's own still-queued natural-
// promotion request before it forces one through via {steal: true} -
// otherwise both could eventually settle for the same tab and race calling
// promoteToWriter() (harmless on its own thanks to the idempotency guard
// above, but the abandoned queued request would sit forever behind the
// steal-acquired lock this tab now holds).
let queuedPromotionController: AbortController | null = null;

/**
 * Asks the current writer (over the handoff BroadcastChannel) to force a
 * save and voluntarily release the lock, rather than waiting for it to
 * close on its own. Resolves "acked" once the writer confirms it saved and
 * dropped to read-only - this tab's own already-queued lock request (from
 * initWriterLock's read-only branch) then gets granted exactly like a
 * natural close would, running the normal rehydrate-then-promote path.
 * Resolves "timeout" if nothing acks within TAKEOVER_ACK_TIMEOUT_MS (the
 * writer may be frozen, crashed, or simply gone with the channel GC'd) -
 * callers should offer stealWriterLock() as the fallback in that case.
 * Resolves "unsupported" if this browser has no BroadcastChannel at all.
 */
export function requestWriterTakeover(): Promise<"acked" | "timeout" | "unsupported"> {
  const channel = getHandoffChannel();
  if (!channel) return Promise.resolve("unsupported");

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    let settled = false;

    const handler = (event: MessageEvent<HandoffMessage>) => {
      const msg = event.data;
      if (!msg || msg.type !== "takeover-ack" || msg.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.removeEventListener("message", handler);
      resolve("acked");
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      channel.removeEventListener("message", handler);
      resolve("timeout");
    }, TAKEOVER_ACK_TIMEOUT_MS);

    channel.addEventListener("message", handler);
    channel.postMessage({ type: "takeover-request", requestId } satisfies HandoffMessage);
  });
}

/**
 * Fallback for when requestWriterTakeover() times out - forcibly takes the
 * Web Lock via the {steal: true} option (breaking whatever unresponsive
 * context is still holding it) rather than waiting indefinitely. Unlike the
 * graceful handoff, this does NOT wait for the previous holder to save
 * first, since by definition it didn't respond to the polite request - the
 * outgoing tab's last unsaved changes (if any) are lost, which is the
 * accepted tradeoff for an otherwise permanently-stuck read-only tab. Still
 * goes through the same rehydrate-or-refuse promoteToWriter() gate as
 * normal promotion, so a stolen lock never lets this tab write over
 * IndexedDB with a stale copy either. Returns whether this tab became
 * writer.
 */
export function stealWriterLock(onPromoted: () => Promise<boolean>): Promise<boolean> {
  if (writerTab) return Promise.resolve(true);
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(false);

  queuedPromotionController?.abort();
  const channel = getHandoffChannel();

  // Resolves as soon as the promotion decision is made, same as
  // initWriterLock's resolveInitialRole() - the granted request's callback
  // (below) keeps the lock held indefinitely via holdUntilTakeover() in the
  // background for as long as this tab stays the writer, so awaiting the
  // whole navigator.locks.request() call itself would never return.
  return new Promise<boolean>((resolve) => {
    navigator.locks
      .request(LOCK_NAME, { mode: "exclusive", steal: true }, async () => {
        const promoted = await promoteToWriter(onPromoted);
        if (promoted) channel?.postMessage({ type: "steal-notice" } satisfies HandoffMessage);
        resolve(promoted);
        if (promoted) return holdUntilTakeover();
      })
      .catch((err) => {
        console.error("[DB] Stealing writer lock failed", err);
        resolve(false);
      });
  });
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
 *
 * `onTakeoverRequested` is called only if/when this tab is (or becomes) the
 * writer and another tab asks for a graceful handoff via
 * requestWriterTakeover() - see holdUntilTakeover() above. It must force a
 * save before returning, since the requester rehydrates from IndexedDB
 * immediately after being granted the lock.
 */
export function initWriterLock(
  onPromoted: () => Promise<boolean>,
  onTakeoverRequested: () => Promise<void>,
): Promise<void> {
  forceSaveForHandoff = onTakeoverRequested;

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
          return holdUntilTakeover();
        }

        // Another tab already holds the lock - read-only until promoted.
        setWriterTab(false);
        resolveInitialRole();

        // Scoped to its own try/catch (not the outer .catch() below) so
        // that queuedPromotionController.abort() - used by
        // stealWriterLock() to cancel this exact request when the graceful
        // handoff times out - can never be misread as "lock coordination
        // failed, so make this tab the writer": an AbortError here, same as
        // any other rejection, must leave writerTab exactly as it was.
        queuedPromotionController = new AbortController();
        try {
          await navigator.locks.request(
            LOCK_NAME,
            { mode: "exclusive", signal: queuedPromotionController.signal },
            async () => {
              const promoted = await promoteToWriter(onPromoted);
              if (promoted) return holdUntilTakeover();
              // release the lock without ever writing from this tab
            },
          );
        } catch (err) {
          if ((err as { name?: string })?.name !== "AbortError") {
            console.error("[DB] Queued writer-lock promotion failed", err);
          }
        }
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
