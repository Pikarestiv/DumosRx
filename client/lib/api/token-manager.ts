import { mirrorAuthToken, clearMirroredAuthToken } from "@/lib/native/widget-bridge";
import { APP_EVENTS, emitAppEvent } from "@/lib/events";
import {
  getAuthToken as readAuthToken,
  setAuthToken as writeAuthToken,
  clearAuthToken as removeAuthToken,
  setAuthTokenIssuedAt as writeAuthTokenIssuedAt,
  clearAuthTokenIssuedAt as removeAuthTokenIssuedAt,
} from "@/lib/storage-keys";

// "refreshed": got a new token, safe to retry the original request.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#api-token-manager-L11
export type RefreshOutcome = "refreshed" | "confirmed-invalid" | "unconfirmed";

let token: string | null = null;
let refreshPromise: Promise<RefreshOutcome> | null = null;
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const REFRESH_TIMEOUT_MS = 20_000;
export const REFRESH_RETRY_DELAY_MS = 2_000;

if (typeof window !== "undefined") {
  token = readAuthToken();
}

export const getToken = (): string | null => {
  if (typeof window !== "undefined" && !token) {
    token = readAuthToken();
  }
  return token;
};

export const setToken = (newToken: string) => {
  token = newToken;
  if (typeof window !== "undefined") {
    writeAuthToken(newToken);
    writeAuthTokenIssuedAt(Date.now());
    emitAppEvent(APP_EVENTS.authTokenSet);
    void mirrorAuthToken(newToken);
  }
};

export const clearToken = () => {
  token = null;
  if (typeof window !== "undefined") {
    removeAuthToken();
    removeAuthTokenIssuedAt();
    emitAppEvent(APP_EVENTS.authTokenCleared);
    void clearMirroredAuthToken();
  }
};

export const getRefreshThreshold = () => REFRESH_THRESHOLD_MS;

export const refreshTokenSilently = async (baseURL: string): Promise<RefreshOutcome> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async (): Promise<RefreshOutcome> => {
    try {
      const url = `${baseURL}/refresh`;
      const currentToken = getToken();

      if (!currentToken) return "unconfirmed";

      const attempt = () => {
        // base-client.ts awaits this before every API request once the token is stale, so an un-timed fetch here blocks every request behind it - the…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-token-manager-ts-L64
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
        return fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
      };

      let response = await attempt();
      if (response.status === 401) {
        await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
        response = await attempt();
      }

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          setToken(data.token);
          return "refreshed";
        }
        return "unconfirmed";
      } else if (response.status === 401) {
        // Only a definitive "this token is invalid" response should unlink the store from cloud sync.
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-token-manager-ts-L90
        clearToken();
        return "confirmed-invalid";
      } else {
        console.error(`Silent token refresh got non-auth failure status ${response.status}; keeping existing token`);
        return "unconfirmed";
      }
    } catch (error) {
      // Network errors (offline, timeout/abort above, DNS failure, etc.) are not evidence the token is invalid either - same reasoning as the non-40…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-token-manager-ts-L103
      console.error("Silent token refresh failed:", error);
      return "unconfirmed";
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};
