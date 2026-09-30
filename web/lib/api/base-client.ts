import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import { addLogToBuffer, sanitizePayload, reportClientError } from "./logger";
import { getAdminToken } from "./admin-token";

interface RequestMetadata {
  metadata?: { startTime: number };
}
type ConfigWithMetadata = InternalAxiosRequestConfig & RequestMetadata;

let initialApiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.dumosrx.com/api/v1";

if (typeof window !== "undefined") {
  // The override is a dev/QA affordance (see ServerSelector, which already
  // hides itself in production). Honouring it in a production build would let
  // anyone able to write one localStorage key repoint every admin API call -
  // and the impersonation handoff redirect, which carries a live super_admin
  // token - at a server they control.
  const storedUrl =
    process.env.NODE_ENV !== "production" ? localStorage.getItem("dumos_api_url") : null;
  if (storedUrl) {
    initialApiUrl = storedUrl;
  } else if (process.env.NODE_ENV === "development") {
    initialApiUrl = process.env.NEXT_PUBLIC_API_URL_STAGING || "https://api.dev.dumosrx.com/api/v1";
  }

  // Registration used to persist its bearer token here (and a duplicate copy
  // inside zustand's "auth-storage"). It no longer does, but anyone who
  // registered before that change still has a live api.dumosrx.com credential
  // sitting in this origin's localStorage with no expiry - so evict it on the
  // first page that loads the API client rather than leaving it readable
  // forever by any XSS foothold on this public marketing site.
  try {
    localStorage.removeItem("drx_token");
    const persisted = localStorage.getItem("auth-storage");
    if (persisted && persisted.includes('"token"')) {
      const parsed = JSON.parse(persisted) as { state?: Record<string, unknown> };
      if (parsed?.state && "token" in parsed.state) {
        delete parsed.state.token;
        localStorage.setItem("auth-storage", JSON.stringify(parsed));
      }
    }
  } catch {
    /* storage unavailable or malformed; nothing to evict */
  }
}

export const API_URL = initialApiUrl;

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
});

export const setBaseURL = (url: string) => {
  apiClient.defaults.baseURL = url;
  if (typeof window !== "undefined") {
    if (url) {
      localStorage.setItem("dumos_api_url", url);
    } else {
      localStorage.removeItem("dumos_api_url");
    }
  }
};

export const getBaseURL = () => {
  return apiClient.defaults.baseURL as string;
};

// Request interceptor for token fallback
apiClient.interceptors.request.use((config: ConfigWithMetadata) => {
  config.metadata = { startTime: Date.now() };

  if (typeof window !== "undefined") {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    // /admin is the ONLY authenticated surface left on this origin, and its
    // access token lives in memory only (zustand), never localStorage - see
    // use-admin-auth-store.ts for why. Everything else dumosrx.com calls is
    // public (landing system-config, verify-email, forgot/reset-password,
    // support, storefront checkout), so there is no non-admin token to attach
    // and, since use-register-form.ts stopped persisting one, nothing left in
    // this origin's localStorage for an XSS foothold to replay.
    const token = isAdminPath ? getAdminToken() : null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // Dev Request Logging
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    console.log(
      `%c[API Request] ${config.method?.toUpperCase()} ${config.url}`,
      "color: #6366f1; font-weight: bold;",
      {
        headers: config.headers,
        data: sanitizePayload(config.data),
      }
    );
  }

  // Add to buffer
  addLogToBuffer({
    timestamp: new Date().toISOString(),
    type: "request",
    method: config.method?.toUpperCase(),
    url: config.url,
    payload: sanitizePayload(config.data),
  });

  return config;
});

// A page usually fires several admin queries at once, so an expired session
// produces a burst of simultaneous 401s. Without this, each one starts its own
// POST /admin/session/refresh; the extra calls are pure waste at best, and race
// each other over a rotating refresh cookie at worst. In-flight refreshes are
// shared and the slot is cleared once settled.
let refreshPromise: Promise<string> | null = null;

const refreshSession = (): Promise<string> => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    // Dynamic import, not a static one: use-admin-auth-store.ts imports
    // client.ts which imports this file, so a static import would cycle.
    const { useAdminAuthStore } = await import("@/lib/store/use-admin-auth-store");
    await useAdminAuthStore.getState().initSession();
    const token = useAdminAuthStore.getState().token;
    if (!token) throw new Error("No token in refresh response");
    return token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
};

/**
 * /admin is the only authenticated surface on this origin, so a 401 anywhere
 * else is an ordinary error, never a reason to navigate. See web/AGENTS.md
 * ("401 handling is admin-only") for why this guard exists (A-94).
 */
export const shouldRecoverFromUnauthorized = (pathname: string, requestUrl?: string): boolean => {
  if (!pathname.startsWith("/admin")) return false;
  if (!requestUrl) return true;
  return !requestUrl.includes("/login") && !requestUrl.includes("/refresh");
};

// Response interceptor for logging & 401 refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const startTime = (response.config as ConfigWithMetadata).metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;

    // Add to buffer
    addLogToBuffer({
      timestamp: new Date().toISOString(),
      type: "response",
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs: duration,
      payload: sanitizePayload(response.data),
    });

    // Dev Response Logging
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      console.log(
        `%c[API Response] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status} (${duration || 0}ms)`,
        "color: #10b981; font-weight: bold;",
        {
          data: sanitizePayload(response.data),
        }
      );
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const startTime = originalRequest?.metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;
    const status = error.response?.status;
    const method = originalRequest?.method?.toUpperCase();
    const url = originalRequest?.url;
    const serverMessage = error.response?.data?.message;
    if (serverMessage && typeof serverMessage === 'string') {
      error.message = serverMessage;
    }

    const errorMessage = error.message || "Unknown error";
    const errorDetails = error.response?.data || error.stack;

    // Add to buffer
    addLogToBuffer({
      timestamp: new Date().toISOString(),
      type: "error",
      method,
      url,
      status,
      durationMs: duration,
      error: errorMessage,
      payload: sanitizePayload(errorDetails),
    });

    // Error logging
    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        console.groupCollapsed(
          `%c[API Error] ${method} ${url} - Status: ${status || "NETWORK_ERROR"} (${duration || 0}ms)`,
          "color: #ef4444; font-weight: bold;"
        );
        console.error("Message:", errorMessage);
        console.log("Details:", errorDetails);
        console.log("Request Payload:", originalRequest ? sanitizePayload(originalRequest.data) : null);
        console.groupEnd();
      } else {
        console.error(`[API Error] ${method} ${url} - Status: ${status || "NETWORK_ERROR"} - ${errorMessage}`);
      }

      // Telemetry reporting for non-401 errors
      if (originalRequest && status !== 401 && !originalRequest.url?.includes("/logs/client-error")) {
        reportClientError(
          method || "UNKNOWN",
          url || "UNKNOWN",
          status,
          errorMessage,
          {
            details: errorDetails,
            requestData: originalRequest.data,
            durationMs: duration,
          }
        );
      }
    }

    // Rewrite the message actually surfaced to UI code (login form, toasts,
    // etc.) once logging/telemetry above has already captured the real
    // technical detail. axios's own "Network Error"/"timeout of Xms
    // exceeded" wording is accurate but meaningless to a non-technical user,
    // and doesn't tell them what to actually do about it.
    if (!error.response && !serverMessage) {
      error.message =
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You appear to be offline. Check your internet connection and try again."
          : "Unable to reach the server. Please check your connection and try again.";
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      typeof window !== "undefined" &&
      shouldRecoverFromUnauthorized(window.location.pathname, originalRequest.url)
    ) {
      originalRequest._retry = true;

      try {
        const token = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch (_refreshError) {
        const { useAdminAuthStore } = await import("@/lib/store/use-admin-auth-store");
        const { useAdminStore } = await import("@/lib/store/use-admin-store");
        useAdminAuthStore.getState().setToken(null);
        useAdminAuthStore.getState().setUser(null);
        useAdminStore.getState().reset();
        if (window.location.pathname.replace(/\/$/, "") !== "/admin/login") {
          const redirectParam = `?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          window.location.href = `/admin/login${redirectParam}`;
        }
      }
    }
    
    return Promise.reject(error);
  }
);
