import { API_BASE_URL } from "../constants";
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
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || API_BASE_URL;
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

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
        ...options.headers,
      },
      ...options,
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
          clearToken();
        }

        if (
          response.status === 403 &&
          errorData.message === "ACCOUNT_SUSPENDED"
        ) {
          try {
            const { execute } = await import("../db/core");
            await execute(
              "UPDATE store_profile SET status = 'Suspended', suspension_reason = ?",
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
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (!error.message?.includes("HTTP error!")) {
        // Network or parse error (not handled by the response.ok block)
        addLogToBuffer({
          timestamp: new Date().toISOString(),
          type: "error",
          method: method,
          url: url,
          status: 0,
          durationMs: duration,
          error: error.message || "Network Error",
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
            error.message || "Network Error",
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
