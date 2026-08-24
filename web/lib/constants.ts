export const APP_NAME = "DumosRx";
export const APP_VERSION = "v0.0.34"; // DumosRx current version (update when bumping version)
export const GITHUB_REPO = "Pikarestiv/DumosRx";

export const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL || "https://dumosrx.com";
export const WEB_APP_DASHBOARD_URL = process.env.NEXT_PUBLIC_WEB_APP_DASHBOARD_URL || "https://app.dumosrx.com/dashboard";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.dumosrx.com";

const APP_URL_STORAGE_KEY = "dumos_app_url";

// The client/ dev server's port is whatever the developer happened to run it
// on, unlike the API URLs (which have fixed local targets) — so instead of a
// fixed env default, this is a runtime override in the same vein as
// getBaseURL/setBaseURL (see ServerSelector), settable via its "App URL"
// field.
export const getAppURL = () => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(APP_URL_STORAGE_KEY);
    if (stored) return stored;
  }
  return APP_URL;
};

export const setAppURL = (url: string) => {
  if (typeof window === "undefined") return;
  if (url) {
    localStorage.setItem(APP_URL_STORAGE_KEY, url);
  } else {
    localStorage.removeItem(APP_URL_STORAGE_KEY);
  }
};
export const STOREFRONT_BASE_URL = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL || "dumosrx.com/store";
export const SYSTEM_EMAIL = "system-logs@dumosrx.com";
export const SUPPORT_EMAIL = "support@dumosrx.com";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.dumosrx.com/api/v1";
export const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL || "https://downloads.dumosrx.com";

export const TRIAL_DURATIONS = [
  "1 day",
  "3 days",
  "7 days",
  "14 days",
  "21 days",
  "1 month",
  "3 months",
  "6 months",
  "1 year"
];
