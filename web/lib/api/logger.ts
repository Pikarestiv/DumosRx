const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface ApiLogEntry {
  timestamp: string;
  type: "request" | "response" | "error";
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  payload?: any;
  error?: any;
}

// In-memory circular log buffer
if (typeof window !== "undefined") {
  (window as any).__DRX_API_LOGS__ = (window as any).__DRX_API_LOGS__ || [];
}

export const addLogToBuffer = (entry: ApiLogEntry) => {
  if (typeof window === "undefined") return;
  const win = window as any;
  win.__DRX_API_LOGS__ = win.__DRX_API_LOGS__ || [];
  win.__DRX_API_LOGS__.push(entry);
  if (win.__DRX_API_LOGS__.length > 50) {
    win.__DRX_API_LOGS__.shift();
  }
};

export const sanitizePayload = (payload: any): any => {
  if (!payload) return payload;
  
  try {
    let parsed = payload;
    if (typeof payload === "string") {
      parsed = JSON.parse(payload);
    }
    
    if (typeof parsed === "object") {
      const sanitized = Array.isArray(parsed) ? [...parsed] : { ...parsed };
      
      // Handle array truncation
      if (Array.isArray(sanitized)) {
        if (sanitized.length > 10) {
          return [
            `Array(${sanitized.length})`,
            ...sanitized.slice(0, 3).map(item => sanitizePayload(item)),
            "...truncated"
          ];
        }
        return sanitized.map(item => sanitizePayload(item));
      }
      
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

export const reportClientError = (method: string, url: string, status: number | undefined, message: string, details: any) => {
  if (url.includes("/logs/client-error")) return;
  if (!shouldReportError(method, url, status || 0, message)) return;
  
  try {
    const token = typeof window !== "undefined"
      ? localStorage.getItem(window.location.pathname.startsWith('/admin') ? "drx_admin_token" : "drx_token")
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
        details: sanitizePayload(details),
      }),
      keepalive: true,
    }).catch(err => {
      console.warn("Failed to transmit error telemetry:", err);
    });
  } catch (_) {
    // Silently catch exceptions
  }
};
