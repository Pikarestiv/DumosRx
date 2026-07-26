export const APP_NAME = "DumosRx";
export const isDevelopment = process.env.NODE_ENV === "development";
export const APP_VERSION = "0.0.29"; // DumosRx current version (update when bumping version)

export const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL || "https://dumosrx.com";
export const WEB_APP_DASHBOARD_URL = process.env.NEXT_PUBLIC_WEB_APP_DASHBOARD_URL || "https://app.dumosrx.com/dashboard";
export const STOREFRONT_BASE_URL = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL || "dumosrx.com/s";
export const SYSTEM_EMAIL = "system-logs@dumosrx.com";
export const SUPPORT_EMAIL = "support@dumosrx.com";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.dumosrx.com/api/v1";
export const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL || "https://downloads.dumosrx.com";
export const UPDATER_JSON_URL = `${DOWNLOAD_URL}/updater.json`;
