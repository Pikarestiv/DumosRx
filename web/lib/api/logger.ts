import { getAdminToken } from "./admin-token";
// base-client.ts imports this module, so this is a cycle - but API_URL is only
// ever read inside reportClientError(), long after both modules have finished
// initialising, never at module scope. Taking it from there rather than
// re-reading NEXT_PUBLIC_API_URL is what keeps telemetry pointed at the same
// server the failing request itself used (dev-staging default, dev override).
import { API_URL } from "./base-client";

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
      if (Array.isArray(parsed)) {
        const sanitized = [...parsed];
        // Handle array truncation
        if (sanitized.length > 10) {
          return [
            `Array(${sanitized.length})`,
            ...sanitized.slice(0, 3).map(item => sanitizePayload(item)),
            "...truncated"
          ];
        }
        return sanitized.map(item => sanitizePayload(item));
      }

      const sanitized: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };

      // Mask sensitive keys
      const sensitiveKeys = ["password", "token", "pin", "newpassword", "oldpassword", "credentials"];
      for (const key of Object.keys(sanitized)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
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
  recentErrors = recentErrors.filter(e => now - e.timestamp < 60000);
};

const shouldReportError = (method: string, url: string, status: number, message: string): boolean => {
  cleanRecentErrors();
  
  if (recentErrors.length >= 5) {
    return false;
  }
  
  const errorKey = `${method}:${url}:${status}:${message}`;
  if (recentErrors.some(e => e.key === errorKey)) {
    return false;
  }
  
  recentErrors.push({ timestamp: Date.now(), key: errorKey });
  return true;
};

/** sanitizePayload() only unwraps a JSON string when that string *is* the
 * payload - one sitting on a key of an object is left alone, because the
 * masking loop only recurses into values that are already objects. axios hands
 * us `requestData` as its own already-stringified request body, so without
 * this the raw body of a failed POST /reset-password,
 * /profile/change-password or /profile/set-pin would reach the telemetry
 * endpoint with the password or PIN unmasked. Pre-parse any such string so the
 * normal masking pass can see inside it. */
const parseNestedJsonStrings = (details: unknown): unknown => {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return details;
  }
  const out: Record<string, unknown> = { ...(details as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (typeof out[key] !== "string") continue;
    try {
      const parsed: unknown = JSON.parse(out[key] as string);
      // Only swap in objects/arrays: a JSON-encoded scalar gains nothing from
      // being unwrapped and would just lose its original form in the report.
      if (typeof parsed === "object" && parsed !== null) {
        out[key] = parsed;
      }
    } catch (_) {
      // Not JSON (form-encoded body, plain text, FormData) - leave it alone.
    }
  }
  return out;
};

export const reportClientError = (method: string, url: string, status: number | undefined, message: string, details: unknown) => {
  if (url.includes("/logs/client-error")) return;
  if (!shouldReportError(method, url, status || 0, message)) return;
  
  try {
    // Only /admin has a token on this origin, and it lives in memory only.
    // Non-admin pages report client errors unauthenticated - see
    // base-client.ts's request interceptor for why nothing is stored here.
    const token = typeof window !== "undefined" && window.location.pathname.startsWith('/admin')
      ? getAdminToken()
      : null;
      
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    fetch(`${API_URL}/logs/client-error`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        method,
        url,
        status: status || null,
        message,
        details: sanitizePayload(parseNestedJsonStrings(details)),
      }),
      keepalive: true,
    }).catch(err => {
      console.warn("Failed to transmit error telemetry:", err);
    });
  } catch (_) {
    // Silently catch exceptions
  }
};
