"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";

/** Route-level guard for pages that are only linked from the sidebar/quick
 * actions for admin/manager/specialist/store_owner roles (e.g. Procurement).
 * The sidebar already hides these links for other roles, but the route
 * itself was still directly reachable (typed URL, stale bookmark, a quick
 * action's href) with no server-side enforcement in this local-first app -
 * this is the only enforcement point, so it must actually redirect rather
 * than just hide a link. */
export function RequireRole({
  children,
  allowSalesStaff = false,
}: {
  children: React.ReactNode;
  /** Expenses is the one page in this set cashiers are also meant to reach
   * (e.g. logging a till expense) - everything else here (Procurement)
   * stays admin/stock-manager only. */
  allowSalesStaff?: boolean;
}) {
  const { isAdmin, canManageStockBatch, user, isAuthenticated } = useAuth();
  const router = useRouter();
  const allowed =
    isAdmin ||
    canManageStockBatch ||
    (allowSalesStaff && user?.role === "sales_staff");

  useEffect(() => {
    if (isAuthenticated && !allowed) {
      toast.error("You don't have permission to access this page");
      router.replace("/dashboard");
    }
  }, [isAuthenticated, allowed, router]);

  if (!isAuthenticated || !allowed) return null;

  return <>{children}</>;
}
