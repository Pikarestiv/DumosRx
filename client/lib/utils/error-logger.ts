/**
 * Global Crash & Error Logger
 */

import { SYSTEM_EMAIL } from "@/lib/constants";

interface CrashInfo {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  platform?: string;
  timestamp: string;
  isFatal?: boolean;
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
export async function logCrash(error: unknown, isFatal = false) {
  const timestamp = new Date().toISOString();

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

  console.error(`[CRASH LOGGER] Capturing error: ${message}`, info);

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
      content: `[CRASH] [${info.platform?.toUpperCase()}] ${isFatal ? 'FATAL: ' : ''}${message}\n\nStack:\n${stack}\n\nUA: ${info.userAgent}\nURL: ${info.url}`,
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
