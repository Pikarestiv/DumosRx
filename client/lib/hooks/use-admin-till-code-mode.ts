import { useEffect, useState } from "react";
import { getUsersByUsernameOrEmail } from "@/lib/db/queries/auth";
import { shouldAttemptAdminTillLogin } from "@/lib/api/admin-till-session";

const DEBOUNCE_MS = 400;

/**
 * True once the typed identifier is one only the on-till admin path can serve:
 * an email that matches no user on this device. Drives the login form's switch
 * from the 4-slot PIN to a 12-digit till access code field.
 *
 * Runs on a debounce AND is re-evaluated on every identifier change, because
 * if it never fires the admin cannot submit at all — the submit button stays
 * gated on a 4-digit length.
 */
export function useAdminTillCodeMode(identifier: string): boolean {
  const candidate = identifier.trim();
  // Derived synchronously so the common case needs no effect and no state.
  const looksLikeEmail = candidate.includes("@");
  const [unknownLocally, setUnknownLocally] = useState(false);

  useEffect(() => {
    if (!looksLikeEmail) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const matches = await getUsersByUsernameOrEmail(candidate);
        if (!cancelled) {
          setUnknownLocally(shouldAttemptAdminTillLogin(candidate, matches.length));
        }
      } catch {
        if (!cancelled) setUnknownLocally(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate, looksLikeEmail]);

  return looksLikeEmail && unknownLocally;
}
