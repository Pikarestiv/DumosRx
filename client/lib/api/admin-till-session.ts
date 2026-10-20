import { apiClient } from "@/lib/api/client";
import { getDeviceId } from "@/lib/utils/device-id";
import { getStoredActiveStoreId } from "@/lib/storage-keys";
import {
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

export const TILL_CODE_LENGTH = 12;

const REQUEST_TIMEOUT_MS = 15_000;

/** AbortSignal.timeout needs Safari 16 / Chrome 103; older WebViews throw
 * synchronously, which inside close() would strand the session. */
function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal?.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

export const UNIFORM_REJECTION = "Wrong password.";

export const OFFLINE_MESSAGE = "Admin access needs an internet connection.";

export const NO_STORE_MESSAGE = "This device has no store set up yet.";

export type TillSessionEndReason = "signed_out" | "idle" | "expired" | "closed";

// True only for an identifier that looks like an email AND matches no user on this device.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#api-admin-till-session-ts-L29
const COMPLETE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A whole email, not a half-typed one — see shouldAttemptAdminTillLogin. */
export function looksLikeCompleteEmail(identifier: string): boolean {
  return COMPLETE_EMAIL.test(identifier.trim());
}

export function shouldAttemptAdminTillLogin(
  identifier: string,
  localCandidateCount: number,
): boolean {
  return localCandidateCount === 0 && COMPLETE_EMAIL.test(identifier.trim());
}

// Deliberately a plain fetch rather than apiClient:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#api-admin-till-session-ts-L49
export async function requestAdminTillSession(
  email: string,
  code: string,
): Promise<TillInspectionSession | null> {
  const deviceId = getDeviceId();
  const storeId = getStoredActiveStoreId();

  const response = await fetch(
    `${apiClient.getBaseURL()}/app/admin-till-session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        code,
        store_id: storeId,
        device_id: deviceId,
      }),
      // Without this a hung request leaves the login spinner forever, on a
      // till whose network is the thing under investigation.
      signal: timeoutSignal(),
    },
  );

  if (!response.ok) return null;

  const body = await response.json();
  if (!body?.session_id) return null;

  // Both deadlines come off THIS device's clock, from the server's duration rather than its absolute timestamp:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-api-admin-till-session-ts-L76
  const now = Date.now();

  return {
    admin: body.admin,
    sessionId: body.session_id,
    hardExpiresAt: new Date(now + Number(body.expires_in) * 1000).toISOString(),
    idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS).toISOString(),
    storeId: storeId ?? null,
    deviceId,
  };
}

// Server time, served only while the session row is live.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#api-admin-till-session-ts-L101
export async function readInspectionServerClock(
  sessionId: string,
): Promise<Date | null> {
  try {
    const response = await fetch(
      `${apiClient.getBaseURL()}/app/admin-till-session/server-time`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
        cache: "no-store",
        signal: timeoutSignal(),
      },
    );

    if (!response.ok) return null;

    const body = await response.json();
    const serverNow = new Date(body?.timestamp);

    return Number.isNaN(serverNow.getTime()) ? null : serverNow;
  } catch {
    return null;
  }
}

export async function endAdminTillSession(
  sessionId: string,
  reason: TillSessionEndReason = "signed_out",
): Promise<void> {
  await fetch(`${apiClient.getBaseURL()}/app/admin-till-session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, reason }),
    signal: timeoutSignal(),
  }).catch(() => {});
}

// Exit on tab close or app quit, where an awaited fetch is cancelled with the page.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#api-admin-till-session-ts-L144
export function beaconAdminTillSessionEnd(sessionId: string): void {
  const payload = JSON.stringify({ session_id: sessionId, reason: "closed" });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `${apiClient.getBaseURL()}/app/admin-till-session/end`,
        new Blob([payload], { type: "application/json" }),
      );
    }
  } catch {
    /* best effort; clock-based expiry is the backstop */
  }
}
