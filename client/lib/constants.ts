export const APP_NAME = "DumosRx";

/** Prefilled into the receipt footer field rather than hardcoded in the
 * renderer, so clearing the field prints no footer at all. */
export const RECEIPT_FOOTER_DEFAULT = "Thank you for your patronage!";
export const isDevelopment = process.env.NODE_ENV === "development";
export const APP_VERSION = "0.0.40"; // DumosRx current version (update when bumping version)

// Short commit SHA of the build this bundle came from, injected by CI.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-ts-L9
export const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA || "").slice(0, 8) || "local";

export const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL || "https://dumosrx.com";
export const STOREFRONT_BASE_URL = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL || "dumosrx.com/store";
export const SYSTEM_EMAIL = "system-logs@dumosrx.com";
export const SUPPORT_EMAIL = "support@dumosrx.com";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.dumosrx.com/api/v1";
export const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL || "https://downloads.dumosrx.com";
export const UPDATER_JSON_URL = `${DOWNLOAD_URL}/updater.json`;
