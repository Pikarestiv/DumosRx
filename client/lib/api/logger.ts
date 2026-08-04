export interface ApiLogEntry {
  timestamp: string;
  type: "request" | "response" | "error";
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  payload?: unknown;
  error?: unknown;
}

// In-memory circular log buffer
if (typeof window !== "undefined") {
  window.__DRX_API_LOGS__ = window.__DRX_API_LOGS__ || [];
}

export const addLogToBuffer = (entry: ApiLogEntry) => {
  if (typeof window === "undefined") return;
  window.__DRX_API_LOGS__ = window.__DRX_API_LOGS__ || [];
  window.__DRX_API_LOGS__.push(entry);
  if (window.__DRX_API_LOGS__.length > 50) {
    window.__DRX_API_LOGS__.shift();
  }
};

export const sanitizePayload = (payload: unknown): unknown => {
  if (!payload) return payload;

  try {
    let parsed = payload;
    if (typeof payload === "string") {
      parsed = JSON.parse(payload);
    }

    if (typeof parsed === "object" && parsed !== null) {
      const sanitized: unknown[] | Record<string, unknown> = Array.isArray(parsed)
        ? [...parsed]
        : { ...(parsed as Record<string, unknown>) };

      // Handle array truncation
      if (Array.isArray(sanitized)) {
        if (sanitized.length > 10) {
          return [
            `Array(${sanitized.length})`,
            ...sanitized.slice(0, 3).map((item) => sanitizePayload(item)),
            "...truncated",
          ];
        }
        return sanitized.map((item) => sanitizePayload(item));
      }

      // Mask sensitive keys
      const sensitiveKeys = [
        "password",
        "token",
        "pin",
        "newpassword",
        "oldpassword",
        "credentials",
      ];
      for (const key of Object.keys(sanitized)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
          sanitized[key] = "********";
        } else if (typeof sanitized[key] === "object") {
          sanitized[key] = sanitizePayload(sanitized[key]);
        }
      }
      return sanitized;
    }
    return parsed;
  } catch (_) {
    return payload;
  }
};

// Rate limiting & deduplication
let recentErrors: Array<{ timestamp: number; key: string }> = [];
const cleanRecentErrors = () => {
  const now = Date.now();
  recentErrors = recentErrors.filter((e) => now - e.timestamp < 60000);
};

const shouldReportError = (
  method: string,
  url: string,
  status: number,
  message: string,
): boolean => {
  cleanRecentErrors();

  if (recentErrors.length >= 5) {
    return false;
  }

  const errorKey = `${method}:${url}:${status}:${message}`;
  if (recentErrors.some((e) => e.key === errorKey)) {
    return false;
  }

  recentErrors.push({ timestamp: Date.now(), key: errorKey });
  return true;
};

export const reportClientError = (
  method: string,
  url: string,
  status: number | undefined,
  message: string,
  details: unknown,
  baseURL: string,
  token: string | null,
) => {
  if (url.includes("/logs/client-error")) return;
  if (!shouldReportError(method, url, status || 0, message)) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    fetch(`${baseURL}/logs/client-error`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        method,
        url,
        status: status || null,
        message,
        details: sanitizePayload(details),
      }),
      keepalive: true,
    }).catch((err) => {
      console.warn("Failed to transmit error telemetry:", err);
    });
  } catch (_) {
    // Silently catch exceptions
  }
};
