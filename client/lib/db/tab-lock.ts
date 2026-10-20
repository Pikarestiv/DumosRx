// Single-writer-tab coordination for the web/PWA build (docs/KNOWN_BUGS.md C1).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-L1

const LOCK_NAME = "dumosrx-db-writer";
const HANDOFF_CHANNEL_NAME = "dumosrx-db-writer-handoff";
const TAKEOVER_ACK_TIMEOUT_MS = 4000;

// Defaults to true (not false) deliberately:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L8
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

// Fires when this tab won the lock on promotion but refused to become writer because rehydrating from IndexedDB failed (see initWriterLock's p…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-ts-L36
export function onPromotionFailed(fn: () => void): () => void {
  promotionFailedListeners.add(fn);
  return () => promotionFailedListeners.delete(fn);
}

// Holds the lock (or the queued request) open for as long as this tab lives.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L43
function holdForever(): Promise<void> {
  return new Promise(() => {});
}

type HandoffMessage =
  | { type: "takeover-request"; requestId: string }
  | { type: "takeover-ack"; requestId: string }
  | { type: "steal-notice" };

// Cross-tab channel used only for the graceful writer handoff below - never for the election itself, which stays entirely on the Web Locks API.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L56
let handoffChannel: BroadcastChannel | null = null;
function getHandoffChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!handoffChannel) {
    handoffChannel = new BroadcastChannel(HANDOFF_CHANNEL_NAME);
    // navigator.locks' {steal:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L65
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

// Set once per tab by initWriterLock() - whatever it is, both the natural writer-hold path and stealWriterLock()'s steal path reuse the same c…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L81
let forceSaveForHandoff: (() => Promise<void>) | null = null;

// Holds a granted writer lock open (like holdForever()) but also listens for a takeover request from another tab.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-ts-L91
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

// Idempotent promotion shared by the natural (queued-lock) promotion path and stealWriterLock() - guards against a tab getting promoted twice…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-ts-L121
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

// Lets stealWriterLock() cancel this tab's own still-queued natural- promotion request before it forces one through via {steal:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L134
let queuedPromotionController: AbortController | null = null;

// Asks the current writer (over the handoff BroadcastChannel) to force a save and voluntarily release the lock, rather than waiting for it to…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-L165
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

// Fallback for when requestWriterTakeover() times out - forcibly takes the Web Lock via the {steal:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-L208
export function stealWriterLock(onPromoted: () => Promise<boolean>): Promise<boolean> {
  if (writerTab) return Promise.resolve(true);
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(false);

  queuedPromotionController?.abort();
  const channel = getHandoffChannel();

  // Resolves as soon as the promotion decision is made, same as initWriterLock's resolveInitialRole() - the granted request's callback (below) k…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L184
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

// Call once, right after this tab's local database is first loaded from IndexedDB.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-tab-lock-L248
export function initWriterLock(
  onPromoted: () => Promise<boolean>,
  onTakeoverRequested: () => Promise<void>,
): Promise<void> {
  forceSaveForHandoff = onTakeoverRequested;

  if (typeof navigator === "undefined" || !navigator.locks) {
    // Web Locks API unsupported (very old browser - it's shipped in every major browser since early 2022).
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L213
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

        // Scoped to its own try/catch (not the outer .catch() below) so that queuedPromotionController.abort() - used by stealWriterLock() to cancel t…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-tab-lock-ts-L234
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
