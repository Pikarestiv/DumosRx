import type { ApiLogEntry } from "@/lib/api/logger";

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
    restoreDatabase?: (binaryData: Uint8Array) => Promise<void>;
    /** Dev utility exposed by lib/db/local-database.ts for console access. */
    forceSyncAllData?: () => Promise<string>;
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
