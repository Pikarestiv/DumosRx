import { mirrorAuthToken, clearMirroredAuthToken } from "@/lib/native/widget-bridge";

let token: string | null = null;
let refreshPromise: Promise<void> | null = null;
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (typeof window !== "undefined") {
  token = localStorage.getItem("auth_token");
}

export const getToken = (): string | null => {
  if (typeof window !== "undefined" && !token) {
    token = localStorage.getItem("auth_token");
  }
  return token;
};

export const setToken = (newToken: string) => {
  token = newToken;
  if (typeof window !== "undefined") {
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("auth_token_issued_at", Date.now().toString());
    window.dispatchEvent(new Event("auth_token_set"));
    void mirrorAuthToken(newToken);
  }
};

export const clearToken = () => {
  token = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_token_issued_at");
    window.dispatchEvent(new Event("auth_token_cleared"));
    void clearMirroredAuthToken();
  }
};

export const getRefreshThreshold = () => REFRESH_THRESHOLD_MS;

export const refreshTokenSilently = async (baseURL: string): Promise<void> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const url = `${baseURL}/refresh`;
      const currentToken = getToken();

      if (!currentToken) return;

      // base-client.ts awaits this before every API request once the token
      // is stale, so an un-timed fetch here blocks every request behind it -
      // the same "iOS Safari can leave a doomed fetch pending far longer
      // than Chrome before it rejects" issue already fixed in
      // license-guard.tsx's sync call and the service worker's navigate
      // handler, just left open here.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          setToken(data.token);
        }
      } else if (response.status === 401 || response.status === 403) {
        // Only a definitive "this token is invalid" response should unlink
        // the store from cloud sync. Any other status - a captive portal's
        // 511, a proxy's 407, a transient 502/503 - is not evidence the
        // token is dead, and clearing it here silently and permanently
        // dropped the device out of sync (sync() then returns
        // "Unauthenticated" forever) until the user manually re-links.
        clearToken();
      } else {
        console.error(`Silent token refresh got non-auth failure status ${response.status}; keeping existing token`);
      }
    } catch (error) {
      // Network errors (offline, timeout/abort above, DNS failure, etc.)
      // are not evidence the token is invalid either - same reasoning as
      // the non-401/403 branch above. Leave the token in place; the next
      // successful request or refresh attempt will sort it out.
      console.error("Silent token refresh failed:", error);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};
