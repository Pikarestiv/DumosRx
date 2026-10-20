import { addLogToBuffer, sanitizePayload, reportClientError } from "./logger";
import {
  getToken,
  setToken,
  clearToken,
  getRefreshThreshold,
  refreshTokenSilently,
} from "./token-manager";
import { STORAGE_KEYS, getAuthTokenIssuedAt } from "@/lib/storage-keys";

const UNREPORTED_STATUSES = new Set([401, 410]);

export class BaseApiClient {
  protected baseURL: string;

  constructor() {
    let storedUrl = null;
    if (typeof window !== "undefined") {
      storedUrl = localStorage.getItem(STORAGE_KEYS.apiUrl);
    }

    if (storedUrl) {
      this.baseURL = storedUrl;
    } else {
      if (process.env.NODE_ENV === "development") {
        this.baseURL = process.env.NEXT_PUBLIC_API_URL_STAGING || "https://api.dev.dumosrx.com/api/v1";
      } else {
        this.baseURL =
          process.env.NEXT_PUBLIC_API_URL || "https://api.dumosrx.com/api/v1";
      }
    }
  }

  setBaseURL(url: string) {
    this.baseURL = url;
    if (typeof window !== "undefined") {
      if (url) {
        localStorage.setItem(STORAGE_KEYS.apiUrl, url);
      } else {
        localStorage.removeItem(STORAGE_KEYS.apiUrl);
      }
    }
  }

  getBaseURL() {
    return this.baseURL;
  }

  setToken(token: string) {
    setToken(token);
  }

  clearToken() {
    clearToken();
  }

  // A-171/A-206: a 2xx whose body will not parse made `.json()` throw an error naming nothing.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#api-base-client-ts-L57
  private async parseJsonResponse<T>(response: Response, url: string): Promise<T> {
    let raw: string | null = null;

    try {
      if (typeof response.text !== "function") {
        return (await response.json()) as T;
      }
      raw = await response.text();
      return JSON.parse(raw) as T;
    } catch (error) {
      const contentType = response.headers?.get?.("content-type") ?? "unknown";
      const kind = error instanceof Error ? error.name : typeof error;
      const detail =
        raw === null
          ? "body unreadable"
          : `${raw.length} bytes, starts ${JSON.stringify(raw.slice(0, 120))}, ends ${JSON.stringify(raw.slice(-120))}`;

      throw new Error(
        `Expected JSON from ${url} but got a non-JSON ${response.status} response` +
          ` (content-type: ${contentType}, ${kind}, ${detail})`,
      );
    }
  }

  protected async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false,
  ): Promise<T> {
    // Intercept to silently refresh token if it's older than 7 days
    if (
      typeof window !== "undefined" &&
      !endpoint.includes("/login") &&
      !endpoint.includes("/refresh")
    ) {
      const issuedAtStr = getAuthTokenIssuedAt();
      if (issuedAtStr && navigator.onLine) {
        const issuedAt = parseInt(issuedAtStr, 10);
        if (Date.now() - issuedAt > getRefreshThreshold()) {
          await refreshTokenSilently(this.baseURL);
        }
      }
    }

    const url = `${this.baseURL}${endpoint}`;
    const currentToken = getToken();

    const { headers: customHeaders, ...restOptions } = options;
    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
        ...customHeaders,
      },
      ...restOptions,
    };

    const startTime = Date.now();
    const method = config.method || "GET";

    addLogToBuffer({
      timestamp: new Date().toISOString(),
      type: "request",
      method: method,
      url: url,
      payload: sanitizePayload(config.body),
    });

    if (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined"
    ) {
      console.log(
        `%c[API Request] ${method} ${url}`,
        "color: #6366f1; font-weight: bold;",
        {
          headers: config.headers,
          data: sanitizePayload(config.body),
        },
      );
    }

    try {
      const response = await fetch(url, config);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Log Error Response
        addLogToBuffer({
          timestamp: new Date().toISOString(),
          type: "error",
          method: method,
          url: url,
          status: response.status,
          durationMs: duration,
          error: errorData.message || `HTTP error! status: ${response.status}`,
          payload: sanitizePayload(errorData),
        });

        if (typeof window !== "undefined") {
          if (process.env.NODE_ENV === "development") {
            console.groupCollapsed(
              `%c[API Error] ${method} ${url} - Status: ${response.status} (${duration}ms)`,
              "color: #ef4444; font-weight: bold;",
            );
            console.error("Message:", errorData.message);
            console.log("Details:", errorData);
            console.log("Request Payload:", sanitizePayload(config.body));
            console.groupEnd();
          } else {
            const log = UNREPORTED_STATUSES.has(response.status)
              ? console.warn
              : console.error;
            log(
              `[API Error] ${method} ${url} - Status: ${response.status} - ${errorData.message}`,
            );
          }

          if (!UNREPORTED_STATUSES.has(response.status) && !url.includes("/logs/client-error")) {
            reportClientError(
              method,
              url,
              response.status,
              errorData.message || "Request failed",
              { details: errorData, durationMs: duration },
              this.baseURL,
              currentToken,
            );
          }
        }

        if (response.status === 401) {
          const isAuthEndpoint =
            endpoint.includes("/login") || endpoint.includes("/refresh");

          // A 401 doesn't necessarily mean the session is truly dead; most of the time it just means the access token expired sooner than the proactive…
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-base-client-ts-L197
          if (!isAuthEndpoint && !isRetry && typeof window !== "undefined") {
            // Trusts refreshTokenSilently()'s own outcome instead of inferring it from whether the token changed.
            // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-base-client-ts-L204
            const outcome = await refreshTokenSilently(this.baseURL);
            if (outcome === "refreshed") {
              return this.request<T>(endpoint, options, true);
            }
            if (outcome === "confirmed-invalid") {
              clearToken();
            }
            // "unconfirmed": leave the token in place.
          } else {
            clearToken();
          }
        }

        if (
          response.status === 403 &&
          errorData.message === "ACCOUNT_SUSPENDED"
        ) {
          try {
            const { execute } = await import("../db/core");
            await execute(
              "UPDATE stores SET status = 'Suspended', suspension_reason = ?",
              [
                errorData.reason ||
                  "Your store account has been suspended for violating our terms of usage. Please contact administrative support.",
              ],
            );
            if (typeof window !== "undefined") {
              window.location.reload();
              return new Promise(() => {}); // prevent further execution
            }
          } catch (e) {
            console.error("Failed to store suspension status locally:", e);
          }
        }

        const errorMessage =
          errorData.message || `HTTP error! status: ${response.status}`;
        const serverError = errorData.error
          ? ` - ${typeof errorData.error === "string" ? errorData.error : JSON.stringify(errorData.error)}`
          : "";
        // status/code let callers (e.g.
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-base-client-ts-L262
        const apiError = new Error(errorMessage + serverError) as Error & {
          status?: number;
          code?: string;
        };
        apiError.status = response.status;
        apiError.code = errorData.code;
        throw apiError;
      }

      const responseData = await this.parseJsonResponse<T>(response, url);

      // Log Success Response
      addLogToBuffer({
        timestamp: new Date().toISOString(),
        type: "response",
        method: method,
        url: url,
        status: response.status,
        durationMs: duration,
        payload: sanitizePayload(responseData),
      });

      if (
        process.env.NODE_ENV === "development" &&
        typeof window !== "undefined"
      ) {
        console.log(
          `%c[API Response] ${method} ${url} - Status: ${response.status} (${duration}ms)`,
          "color: #10b981; font-weight: bold;",
          {
            data: sanitizePayload(responseData),
          },
        );
      }

      return responseData;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Network Error";
      const thrownStatus = (error as { status?: number } | null)?.status;

      if (thrownStatus === undefined) {
        // Network or parse error (not handled by the response.ok block)
        addLogToBuffer({
          timestamp: new Date().toISOString(),
          type: "error",
          method: method,
          url: url,
          status: 0,
          durationMs: duration,
          error: errorMessage,
          payload: null,
        });

        if (
          typeof window !== "undefined" &&
          !url.includes("/logs/client-error")
        ) {
          reportClientError(
            method,
            url,
            0,
            errorMessage,
            { durationMs: duration },
            this.baseURL,
            currentToken,
          );
        }
      }

      if (thrownStatus !== undefined && UNREPORTED_STATUSES.has(thrownStatus)) {
        console.warn("API request refused:", errorMessage);
      } else {
        console.error("API request failed:", error);
      }
      throw error;
    }
  }
}
