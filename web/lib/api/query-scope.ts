import { useAuthStore } from "@/lib/store/use-auth-store";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

/**
 * The identity every account-scoped query key is suffixed with, so a
 * switch of logged-in account — including a superadmin starting/ending
 * impersonation — can never resolve to a cache slot the previous session's
 * queries already own. This is the structural backstop behind the
 * queryClient.clear()/cancelQueries() calls already wired into every
 * logout/login/impersonation path: even if one of those were ever missed,
 * the new session simply never reads the old slot to begin with.
 *
 * store_id is deliberately not part of this: in this app a session always
 * belongs to exactly one user (a store owner has exactly one store, and
 * impersonation swaps in that store owner's own user id), so store_id can
 * never disagree with user_id here — unlike client/'s POS app, where one
 * device's fixed identity can switch between stores independently.
 *
 * Reads from both auth stores (rather than requiring each call site to
 * know which one applies) since hooks.ts (store-owner dashboard) and
 * admin-hooks.ts (platform admin) each have their own.
 */
export function useScopeId(): string {
  const dashboardUserId = useAuthStore((s) => s.user?.id);
  const adminUserId = useAdminAuthStore((s) => s.user?.id);
  return dashboardUserId ?? adminUserId ?? "anon";
}

export function useScopedKey(key: readonly unknown[]): unknown[] {
  const scopeId = useScopeId();
  return [...key, scopeId];
}
