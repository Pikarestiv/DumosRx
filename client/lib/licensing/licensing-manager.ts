/**
 * Licensing & Subscription Manager
 * Handles offline-first license verification and clock-tampering protection.
 */

import { query, execute } from "@/lib/db/core";

export interface LicenseInfo {
  isValid: boolean;
  tier: "free" | "pro" | "enterprise";
  expiryDate: string | null;
  isClockTampered: boolean;
  message?: string;
}

export async function checkLicenseStatus(): Promise<LicenseInfo> {
  const profiles = await query<any>("SELECT * FROM store_profile LIMIT 1");
  const profile = profiles[0];

  if (!profile) {
    return { isValid: true, tier: "free", expiryDate: null, isClockTampered: false };
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
  await execute("UPDATE store_profile SET last_monotonic_time = ? WHERE id = ?", [nowIso, profile.id]);

  // 3. Free tier is always valid (but with limited features)
  if (!profile.subscription_tier || profile.subscription_tier === "free") {
    return { isValid: true, tier: "free", expiryDate: null, isClockTampered: false };
  }

  // 4. Verify License Token (Mock logic for now, later decrypt actual JWT/signed token)
  // In production, we'd verify the signature of the license_token here.
  try {
    const tokenData = profile.license_token ? JSON.parse(profile.license_token) : null;
    
    if (!tokenData || !tokenData.expiry) {
      return { isValid: false, tier: "free", expiryDate: null, isClockTampered: false, message: "No active subscription found." };
    }

    if (nowIso > tokenData.expiry) {
      return { 
        isValid: false, 
        tier: profile.subscription_tier as any, 
        expiryDate: tokenData.expiry, 
        isClockTampered: false,
        message: "Your subscription has expired. Please renew to continue using Pro features." 
      };
    }

    return { 
      isValid: true, 
      tier: profile.subscription_tier as any, 
      expiryDate: tokenData.expiry, 
      isClockTampered: false 
    };
  } catch (e) {
    return { isValid: false, tier: "free", expiryDate: null, isClockTampered: false, message: "Invalid license token." };
  }
}

/**
 * Mock function to activate a license (usually called after successful payment or token entry)
 */
export async function activateLicense(token: string) {
  // In a real app, verify token with server or public key
  try {
    const decoded = JSON.parse(token); // Mock: token is just JSON for now
    await execute(
      "UPDATE store_profile SET license_token = ?, subscription_tier = ?, updated_at = ?",
      [token, decoded.tier || "pro", new Date().toISOString()]
    );
    return true;
  } catch (e) {
    return false;
  }
}
