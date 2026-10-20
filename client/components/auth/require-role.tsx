"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";

// Route-level guard for pages that are only linked from the sidebar/quick actions for admin/manager/specialist/store_owner…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-auth-require-role-tsx-L9
export function RequireRole({
  children,
  allowSalesStaff = false,
  permission,
}: {
  children: React.ReactNode;
  // Expenses is the one page in this set cashiers are also meant to reach (e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-auth-require-role-tsx-L22
  allowSalesStaff?: boolean;
  // A specific permission key required on TOP of the coarse role baseline, for routes whose category has been migrated off r…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-auth-require-role-tsx-L26
  permission?: string;
}) {
  const { isAdmin, canManageStockBatch, user, isAuthenticated } = useAuth();
  const router = useRouter();
  const hasRequiredPermission = useHasPermission(permission ?? "");
  const allowed =
    (isAdmin ||
      canManageStockBatch ||
      (allowSalesStaff && user?.role === "sales_staff")) &&
    (!permission || hasRequiredPermission);

  useEffect(() => {
    if (isAuthenticated && !allowed) {
      toast.error("You don't have permission to access this page");
      router.replace("/dashboard");
    }
  }, [isAuthenticated, allowed, router]);

  if (!isAuthenticated || !allowed) return null;

  return <>{children}</>;
}
