/**
 * Licensing & Subscription Manager
 * Handles offline-first license verification and clock-tampering protection.
 */

import { getStoreProfile, updateStoreMonotonicTime } from "@/lib/db/queries/setup";
import { readServerClock, describeDrift } from "./server-clock";
import { readInspectionServerClock } from "@/lib/api/admin-till-session";
import { getTillInspectionSession } from "@/lib/utils/till-inspection";
import {
  logTillRepair,
  TILL_REPAIR_ACTIONS,
} from "@/lib/utils/till-inspection-audit";
import { boundedNowIso } from "./monotonic-clock";

const LICENSE_TIERS = ["free", "local", "pro", "enterprise"] as const;
export type LicenseTier = (typeof LICENSE_TIERS)[number];

// Narrows a raw tier string (from the store profile or a license token) to a known LicenseTier, falling back to "free" for anything unrecogniz…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-licensing-manager-ts-L19
function toLicenseTier(value: string | null | undefined): LicenseTier {
  return (LICENSE_TIERS as readonly string[]).includes(value ?? "")
    ? (value as LicenseTier)
    : "free";
}

export interface LicenseInfo {
  isValid: boolean;
  tier: LicenseTier;
  expiryDate: string | null;
  isClockTampered: boolean;
  // True only when the store account itself was suspended (stores.status === "Suspended"), as opposed to an expired/absent subscription.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-licensing-manager-ts-L34
  isSuspended: boolean;
  isTrial?: boolean;
  message?: string;
  /** Populated only on the clock-tampered branch, for the lock screen's
   * technical details. */
  monotonicWatermark?: string;
  localTime?: string;
}

export async function checkLicenseStatus(): Promise<LicenseInfo> {
  const profile = await getStoreProfile();

  if (!profile) {
    return { isValid: true, tier: "free", expiryDate: null, isClockTampered: false, isSuspended: false };
  }

  // 0. Check for account suspension
  if (profile.status === "Suspended") {
    return {
      isValid: false,
      tier: toLicenseTier(profile.subscription_tier),
      expiryDate: null,
      isClockTampered: false,
      isSuspended: true,
      message: profile.suspension_reason || "Your store account has been suspended for violating our terms of usage. Please contact administrative support."
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  
  // 1. Check for clock tampering
  // If current time is earlier than the last recorded action time, someone rolled back the clock.
  if (profile.last_monotonic_time && nowIso < profile.last_monotonic_time) {
    return {
      isValid: false,
      tier: toLicenseTier(profile.subscription_tier),
      expiryDate: null,
      isClockTampered: true,
      isSuspended: false,
      monotonicWatermark: profile.last_monotonic_time,
      localTime: nowIso,
      message: "System clock discrepancy detected. Connect to the internet and press Check Again — this can only be cleared online.",
    };
  }

  // 2. Update monotonic time for next check, forward-bounded so a wall clock
  // that leaps cannot poison the watermark and lock the device out (A-191).
  await updateStoreMonotonicTime(profile.id, boundedNowIso());

  // 3. Free tier is always valid if there's no license token
  if ((!profile.subscription_tier || profile.subscription_tier === "free") && !profile.license_token) {
    return { isValid: true, tier: "free", expiryDate: null, isClockTampered: false, isSuspended: false };
  }

  // 4. Verify License Token
  try {
    const tokenData = profile.license_token ? JSON.parse(profile.license_token) : null;
    
    if (!tokenData || !tokenData.expiry || !tokenData.tier) {
      return { 
        isValid: false, 
        tier: "free", 
        expiryDate: null, 
        isClockTampered: false, 
        isSuspended: false, 
        message: "No active subscription found. Please connect to cloud to activate." 
      };
    }

    // Ensure the profile tier matches the token tier to prevent manual tampering of profile table
    if (profile.subscription_tier !== tokenData.tier) {
       console.warn("[Licensing] Tier mismatch detected between profile and token.");
    }

    if (nowIso > tokenData.expiry) {
      if (tokenData.tier === "free" || profile.subscription_tier === "free") {
        return { 
          isValid: true, 
          tier: "free", 
          expiryDate: null, 
          isTrial: false,
          isClockTampered: false,
          isSuspended: false 
        };
      }
      return { 
        isValid: false, 
        tier: toLicenseTier(tokenData.tier), 
        expiryDate: tokenData.expiry, 
        isClockTampered: false,
        isSuspended: false,
        message: "Your subscription has expired. Please renew to continue using Pro features." 
      };
    }

    return { 
      isValid: true, 
      tier: toLicenseTier(tokenData.tier), 
      expiryDate: tokenData.expiry, 
      isTrial: tokenData.is_trial,
      isClockTampered: false,
      isSuspended: false 
    };
  } catch (_e) {
    return { isValid: false, tier: "free", expiryDate: null, isClockTampered: false, isSuspended: false, message: "Invalid license token." };
  }
}

// The admin-present version of reconcileClockWithServer():
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-licensing-manager-L147
export async function overrideClockLockout(): Promise<
  { ok: boolean; reason: string }
> {
  const session = getTillInspectionSession();
  if (!session) {
    throw new Error("Requires an admin inspection session.");
  }

  const profile = await getStoreProfile();
  if (!profile) return { ok: false, reason: "No store profile on this device." };

  // Deliberately NOT the public /health endpoint:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-licensing-licensing-manager-ts-L156
  const serverNow = await readInspectionServerClock(session.sessionId);
  if (!serverNow) {
    return {
      ok: false,
      reason:
        "Could not confirm the time with our servers for this session. Check the connection and try again.",
    };
  }

  await updateStoreMonotonicTime(profile.id, serverNow.toISOString());

  await logTillRepair(TILL_REPAIR_ACTIONS.clockOverride, profile.id, {
    server_now: serverNow.toISOString(),
  });

  return { ok: true, reason: "Clock watermark reset to server time by admin override." };
}

// Clears a clock lock, but only against authoritative server time.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-licensing-manager-L191
export async function reconcileClockWithServer(): Promise<
  { reconciled: boolean; reason: string }
> {
  const profile = await getStoreProfile();
  if (!profile) return { reconciled: false, reason: "No store profile on this device." };

  if (!profile.last_monotonic_time) {
    return { reconciled: false, reason: "No clock watermark recorded." };
  }

  const reading = await readServerClock();
  if (!reading) {
    return {
      reconciled: false,
      reason: "Could not reach our servers to confirm the time. Connect to the internet and try again.",
    };
  }

  if (!reading.agrees) {
    return {
      reconciled: false,
      reason: `This device's clock is ${describeDrift(reading.driftMs)}. Correct the date and time, then try again.`,
    };
  }

  const serverNowIso = reading.serverNow.toISOString();
  if (serverNowIso >= profile.last_monotonic_time) {
    return { reconciled: false, reason: "The clock watermark is not ahead of server time." };
  }

  await updateStoreMonotonicTime(profile.id, serverNowIso);

  return { reconciled: true, reason: "Clock verified against our servers." };
}
