import { apiClient } from "@/lib/api/client";
import { getDeviceId } from "@/lib/utils/device-id";
import { getStoredActiveStoreId } from "@/lib/storage-keys";
import {
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

export const TILL_CODE_LENGTH = 12;

export const UNIFORM_REJECTION = "Wrong password.";

export const OFFLINE_MESSAGE = "Admin access needs an internet connection.";

export const NO_STORE_MESSAGE = "This device has no store set up yet.";

export type TillSessionEndReason = "signed_out" | "idle" | "expired";

/**
 * True only for an identifier that looks like an email AND matches no user on
 * this device. The second half is load-bearing: lib/db/queries/auth.ts already
 * accepts an email as an ordinary login identifier, so a store owner signing
 * in with theirs must stay local and offline.
 */
export function shouldAttemptAdminTillLogin(
  identifier: string,
  localCandidateCount: number,
): boolean {
  return localCandidateCount === 0 && identifier.trim().includes("@");
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

export async function endAdminTillSession(
  sessionId: string,
  reason: TillSessionEndReason = "signed_out",
): Promise<void> {
  await fetch(`${apiClient.getBaseURL()}/app/admin-till-session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, reason }),
  }).catch(() => {});
}
