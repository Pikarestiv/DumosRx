import type { ApiLogEntry } from "@/lib/api/logger";
import type { SyncResult } from "@/lib/db/sync-engine/types";

export {};

declare global {
  interface Window {
    /** In-memory circular buffer of recent API requests/responses/errors,
     * populated by lib/api/logger.ts for console inspection. */
    __DRX_API_LOGS__?: ApiLogEntry[];
    /** Tauri v1 injects this on the window; presence means we're in the desktop app. */
    __TAURI__?: unknown;
    /** Tauri v2 injects this instead of/alongside __TAURI__. */
    __TAURI_INTERNALS__?: unknown;
    /** Dev/debug utilities exposed by lib/db/core.ts for console access. */
    getDatabaseBinary?: () => Uint8Array | null;
    restoreDatabase?: (binaryData: Uint8Array) => Promise<{ snapshotSucceeded: boolean }>;
    /** Test-only (development builds only): elevates the local `stores` row's
     * subscription_tier directly, for e2e specs that need a paid-tier-gated
     * module unlocked without racing LockedModuleOverlay's mount timing or
     * mutating the shared free-tier e2e fixture. See lib/db/core.ts. */
    __e2eSetSubscriptionTier?: (tier: string) => Promise<void>;
    /** Read-only audit of which legacy migration artifacts (old table/column
     * names, unmigrated stock_quantity, missing store_id backfill, etc.)
     * remain on this device's local database. Safe to run anywhere,
     * including production, since it never writes. `retirable` additionally
     * reports, per still-active legacy-repair migration, whether THIS device
     * blocks deleting it (all active devices must report ok). */
    diagnoseLegacySchema?: () => Promise<{
      clean: boolean;
      findings: string[];
      retirable: Record<string, { ok: boolean; reason: string }>;
    }>;
    /** Dev utility exposed by lib/db/local-database.ts for console access. */
    forceSyncAllData?: () => Promise<string>;
    /** Recovery tool for a device whose pull cursor has drifted ahead of
     * content it never actually received (e.g. after a mid-round crash) —
     * clears `_sync_state` so the next pull re-fetches every table from
     * scratch instead of resuming from a stuck delta cursor. Never touches
     * local data or the outbound `_sync_queue`. Exposed unconditionally,
     * including production, for a support session to run from DevTools on
     * the affected device — deliberately not wired to any in-app UI, since a
     * full re-pull of a large catalog isn't free on a slow connection and
     * shouldn't be one accidental tap away for a store owner. See
     * lib/db/sync-engine/index.ts. */
    __forceFullResync?: () => Promise<SyncResult>;
    /** Repair tool for a batch whose server-side quantity was never derived
     * from a movement delta (a pre-`a36b00e7` bulk import): posts this
     * device's own stock_batches quantities so the server can adopt them,
     * recording each correction as a real 'sync_reconciliation' movement.
     * Also wired to Settings > Data > "Health Sync"; exposed
     * here as well so a support session can run it from DevTools. See
     * lib/db/sync-engine/index.ts. */
    __reconcileStockQuantities?: () => Promise<{
      reconciled: number;
      checked: number;
    }>;
    /** Read-only audit of every active batch against its own movement log.
     * Safe anywhere, including production: it never writes. Exposed for a
     * support session; see lib/db/sync-engine/stock-integrity.ts. */
    __verifyStockIntegrity?: () => Promise<import("@/lib/db/sync-engine/stock-integrity").StockIntegrityReport>;
    /** Rebuilds each diverged batch's quantity from its own movement log,
     * refusing any batch the log cannot account for. Local-only; nothing is
     * pushed. See lib/db/sync-engine/stock-integrity.ts. */
    __foldStockQuantities?: () => Promise<import("@/lib/db/sync-engine/stock-integrity").FoldResult>;
    /** Legacy IE/Edge-on-iOS marker, used only to help detect real iOS Safari. */
    MSStream?: unknown;
  }

  interface Navigator {
    /** Non-standard Safari property: true when running as an installed PWA
     * launched from the Home Screen (iOS has no `display-mode: standalone`
     * media query support prior to detecting this). */
    standalone?: boolean;
  }
}
