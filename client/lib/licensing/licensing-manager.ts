/**
 * Licensing & Subscription Manager
 * Handles offline-first license verification and clock-tampering protection.
 */

import { getStoreProfile, updateStoreMonotonicTime } from "@/lib/db/queries/setup";

const LICENSE_TIERS = ["free", "local", "pro", "enterprise"] as const;
export type LicenseTier = (typeof LICENSE_TIERS)[number];

/** Narrows a raw tier string (from the store profile or a license token) to a
 * known LicenseTier, falling back to "free" for anything unrecognized:
 * this gates paid-feature access, so an unchecked cast could grant tiers
 * that don't exist. */
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
  /** True only when the store account itself was suspended (stores.status ===
   * "Suspended"), as opposed to an expired/absent subscription. Branch on
   * this, never on `message` — that field is display text and its wording
   * may change. */
  isSuspended: boolean;
  isTrial?: boolean;
  message?: string;
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
      message: "System clock discrepancy detected. Please ensure your computer date is correct and sync online."
    };
  }

  // 2. Update monotonic time for next check
  await updateStoreMonotonicTime(profile.id, nowIso);

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

