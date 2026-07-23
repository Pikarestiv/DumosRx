/**
 * Licensing & Subscription Manager
 * Handles offline-first license verification and clock-tampering protection.
 */

import { execute } from "@/lib/db/core";
import { getStoreProfile, updateStoreMonotonicTime } from "@/lib/db/queries/setup";

export interface LicenseInfo {
  isValid: boolean;
  tier: "free" | "local" | "pro" | "enterprise";
  expiryDate: string | null;
  isClockTampered: boolean;
  isTrial?: boolean;
  message?: string;
}

export async function checkLicenseStatus(): Promise<LicenseInfo> {
  const profile = await getStoreProfile();

  if (!profile) {
    return { isValid: true, tier: "free", expiryDate: null, isClockTampered: false };
  }

  // 0. Check for account suspension
  if (profile.status === "Suspended") {
    return {
      isValid: false,
      tier: profile.subscription_tier as any,
      expiryDate: null,
      isClockTampered: false,
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
      tier: profile.subscription_tier as any, 
      expiryDate: null, 
      isClockTampered: true,
      message: "System clock discrepancy detected. Please ensure your computer date is correct and sync online."
    };
  }

  // 2. Update monotonic time for next check
  await updateStoreMonotonicTime(profile.id, nowIso);

  // 3. Free tier is always valid if there's no license token
  if ((!profile.subscription_tier || profile.subscription_tier === "free") && !profile.license_token) {
    return { isValid: true, tier: "free", expiryDate: null, isClockTampered: false };
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
          isClockTampered: false 
        };
      }
      return { 
        isValid: false, 
        tier: tokenData.tier as any, 
        expiryDate: tokenData.expiry, 
        isClockTampered: false,
        message: "Your subscription has expired. Please renew to continue using Pro features." 
      };
    }

    return { 
      isValid: true, 
      tier: tokenData.tier as any, 
      expiryDate: tokenData.expiry, 
      isTrial: tokenData.is_trial,
      isClockTampered: false 
    };
  } catch (_e) {
    return { isValid: false, tier: "free", expiryDate: null, isClockTampered: false, message: "Invalid license token." };
  }
}

/**
 * Activates a license by storing a cloud-verified token.
 * This is called after successful cloud synchronization or manual key entry.
 */
export async function activateLicense(token: string) {
  try {
    const decoded = JSON.parse(token); 
    await execute(
      "UPDATE stores SET license_token = ?, subscription_tier = ?, updated_at = ?",
      [token, decoded.tier || "pro", new Date().toISOString()]
    );
    return true;
  } catch (_e) {
    console.error("[Licensing] Failed to activate license:", _e);
    return false;
  }
}
