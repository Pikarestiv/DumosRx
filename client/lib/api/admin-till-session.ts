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

/**
 * True only for an identifier that looks like an email AND matches no user on
 * this device. The second half is load-bearing: lib/db/queries/auth.ts already
 * accepts an email as an ordinary login identifier, so a store owner signing
 * in with theirs must stay local and offline.
 */
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

/**
 * Deliberately a plain fetch rather than apiClient: base-client treats a 401
 * on a non-auth endpoint as an expired token, silently refreshes the till's
 * OWN sync token, retries, and clears it on the second 401 — so a mistyped
 * till code would unlink the device from cloud sync. It also must not send
 * the till's bearer, which this endpoint neither needs nor should see.
 */
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

  // Both deadlines come off THIS device's clock, from the server's duration
  // rather than its absolute timestamp: a till whose clock runs hours fast
  // would otherwise read a brand-new session as already expired — on exactly
  // the misconfigured-clock device this feature exists to inspect.
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

/**
 * Server time, served only while the session row is live. The clock override
 * uses this rather than the public /health endpoint so the server — not a
 * forgeable sessionStorage flag — is what authorises it.
 */
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

/**
 * Exit on tab close or app quit, where an awaited fetch is cancelled with the
 * page. Closing the app is the most common exit on a desktop till, and without
 * this the session row kept no exit row and no duration.
 */
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
