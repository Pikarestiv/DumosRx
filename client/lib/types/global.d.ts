export {};

declare global {
  interface Window {
    /** Tauri v1 injects this on the window; presence means we're in the desktop app. */
    __TAURI__?: unknown;
    /** Tauri v2 injects this instead of/alongside __TAURI__. */
    __TAURI_INTERNALS__?: unknown;
    /** Dev/debug utilities exposed by lib/db/core.ts for console access. */
    getDatabaseBinary?: () => Uint8Array | null;
    restoreDatabase?: (binaryData: Uint8Array) => Promise<void>;
    /** Dev utility exposed by lib/db/local-database.ts for console access. */
    forceSyncAllData?: () => Promise<string>;
  }
}
