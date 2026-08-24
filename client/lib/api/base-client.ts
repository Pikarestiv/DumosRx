import { addLogToBuffer, sanitizePayload, reportClientError } from "./logger";
import {
  getToken,
  setToken,
  clearToken,
  getRefreshThreshold,
  refreshTokenSilently,
} from "./token-manager";

export class BaseApiClient {
  protected baseURL: string;

  constructor() {
    let storedUrl = null;
    if (typeof window !== "undefined") {
      storedUrl = localStorage.getItem("dumos_api_url");
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
        localStorage.setItem("dumos_api_url", url);
      } else {
        localStorage.removeItem("dumos_api_url");
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
      const issuedAtStr = localStorage.getItem("auth_token_issued_at");
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
            console.error(
              `[API Error] ${method} ${url} - Status: ${response.status} - ${errorData.message}`,
            );
          }

          if (response.status !== 401 && !url.includes("/logs/client-error")) {
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

          // A 401 doesn't necessarily mean the session is truly dead; most
          // of the time it just means the access token expired sooner than
          // the proactive 7-day age check above expected. Try one silent
          // refresh-and-retry before forcing the user to re-link; clearing
          // unconditionally on every 401 logged store owners out far more
          // often than the token was actually invalid.
          if (
            !isAuthEndpoint &&
            !isRetry &&
            typeof window !== "undefined" &&
            navigator.onLine
          ) {
            const tokenBeforeRefresh = getToken();
            await refreshTokenSilently(this.baseURL);
            const tokenAfterRefresh = getToken();
            if (tokenAfterRefresh && tokenAfterRefresh !== tokenBeforeRefresh) {
              return this.request<T>(endpoint, options, true);
            }
          }

          clearToken();
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
        throw new Error(errorMessage + serverError);
      }

      const responseData = await response.json();

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

      if (!errorMessage.includes("HTTP error!")) {
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

      console.error("API request failed:", error);
      throw error;
    }
  }
}
