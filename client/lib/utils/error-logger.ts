/**
 * Global Crash & Error Logger
 */

import * as Sentry from "@sentry/nextjs";
import { SYSTEM_EMAIL } from "@/lib/constants";
import { getDeviceId } from "@/lib/utils/device-id";

interface CrashInfo {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  platform?: string;
  timestamp: string;
  isFatal?: boolean;
}

/** Extra context callers can attach to pin down *what* failed, not just that
 * something did — e.g. which table/record a sync failure was operating on. */
export interface CrashContext {
  area?: string;
  table?: string;
  recordId?: string;
  [key: string]: unknown;
}

const STORAGE_KEY = "dumosrx_pending_crashes";

// Queue error to localStorage as a fallback
function queueToLocalStorage(info: CrashInfo) {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    const list: CrashInfo[] = existing ? JSON.parse(existing) : [];
    list.push(info);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("[Logger] Failed to write error to localStorage", err);
  }
}

// Log a crash to SQLite database or local storage fallback
export async function logCrash(error: unknown, isFatal = false, context: CrashContext = {}) {
  const timestamp = new Date().toISOString();
  const deviceId = getDeviceId();

  // Extract error info
  let message = "Unknown Error";
  let stack = "";
  if (error instanceof Error) {
    message = error.message;
    stack = error.stack || "";
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object") {
    const err = error as { message?: string; stack?: string };
    message = err.message || JSON.stringify(error);
    stack = err.stack || "";
  }

  // Detect platform
  const isTauri = typeof window !== "undefined" &&
    (window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined);

  const info: CrashInfo = {
    message,
    stack,
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    platform: isTauri ? "tauri" : "web",
    timestamp,
    isFatal,
  };

  console.error(`[CRASH LOGGER] Capturing error: ${message}`, info, context);

  // Forward to Sentry; never let it break local crash logging, which must
  // keep working offline regardless of network/DSN availability.
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(message), {
      tags: {
        platform: info.platform,
        fatal: String(isFatal),
        device_id: deviceId,
        area: context.area,
      },
      extra: { url: info.url, userAgent: info.userAgent, ...context },
    });
  } catch (_) {}

  // Ship directly to our own server too, independent of the local SQLite
  // sync queue below: when the crash IS a sync failure, waiting on that same
  // broken sync path to eventually deliver this report would mean it never
  // arrives. keepalive fetch survives the tab closing right after a crash.
  try {
    const { apiClient } = await import("@/lib/api/client");
    const { reportClientError } = await import("@/lib/api/logger");
    reportClientError(
      "CRASH",
      context.area ? `client-crash/${context.area}` : "client-crash",
      isFatal ? 500 : 200,
      message,
      { stack, deviceId, isFatal, ...context },
      apiClient.getBaseURL(),
      localStorage.getItem("auth_token"),
    );
  } catch (_) {}

  // Try to find user_id
  let userId = "anonymous";
  try {
    const authData = localStorage.getItem("auth-storage");
    if (authData) {
      const parsed = JSON.parse(authData);
      if (parsed?.state?.user?.id) {
        userId = parsed.state.user.id;
      }
    }
  } catch (_) {}

  // Attempt to write to feedback table in SQLite
  try {
    const { insert: dbInsert } = await import("@/lib/db/local-database");
    
    await dbInsert("feedback", {
      id: crypto.randomUUID(),
      user_id: userId,
      type: "bug",
      content: `[CRASH] [${info.platform?.toUpperCase()}] ${isFatal ? 'FATAL: ' : ''}${message}\n\nDevice: ${deviceId}${Object.keys(context).length ? `\nContext: ${JSON.stringify(context)}` : ''}\n\nStack:\n${stack}\n\nUA: ${info.userAgent}\nURL: ${info.url}`,
      contact_email: SYSTEM_EMAIL,
      status: "pending",
      created_at: timestamp,
      _synced: 0
    });
    console.log("[Logger] Crash log written to local database");
  } catch (dbErr) {
    console.warn("[Logger] SQLite not available, queueing crash to localStorage:", dbErr);
    queueToLocalStorage(info);
  }
}

// Flush pending crashes from localStorage into SQLite
export async function flushPendingCrashes() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) return;

    const list: CrashInfo[] = JSON.parse(existing);
    if (list.length === 0) return;

    const { insert: dbInsert } = await import("@/lib/db/local-database");
    
    let userId = "anonymous";
    try {
      const authData = localStorage.getItem("auth-storage");
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed?.state?.user?.id) {
          userId = parsed.state.user.id;
        }
      }
    } catch (_) {}

    console.log(`[Logger] Flushing ${list.length} pending crashes from localStorage to SQLite...`);
    
    for (const info of list) {
      await dbInsert("feedback", {
        id: crypto.randomUUID(),
        user_id: userId,
        type: "bug",
        content: `[QUEUED CRASH] [${info.platform?.toUpperCase()}] ${info.isFatal ? 'FATAL: ' : ''}${info.message}\n\nStack:\n${info.stack}\n\nUA: ${info.userAgent}\nURL: ${info.url}`,
        contact_email: SYSTEM_EMAIL,
        status: "pending",
        created_at: info.timestamp,
        _synced: 0
      });
    }

    localStorage.removeItem(STORAGE_KEY);
    console.log("[Logger] Successfully flushed pending crashes");
  } catch (err) {
    console.error("[Logger] Failed to flush pending crashes:", err);
  }
}
