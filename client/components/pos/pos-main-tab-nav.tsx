"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/lib/hooks/use-permissions";

/** Tab nav only; pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function POSMainTabNav() {
  // Unconditional top-level const (see pos-cart.tsx's canApplyDiscounts).
  // pos-system.tsx runs the same check for the panel itself and for the
  // active-tab fallback - hiding the trigger alone would still leave
  // ?tab=history reachable by URL.
  const canViewSalesHistory = useHasPermission("view_sales_history");

  return (
    <TabsList className="w-full md:w-auto">
      <TabsTrigger value="products">Products</TabsTrigger>
      {canViewSalesHistory && (
        <TabsTrigger value="history">Recent Sales</TabsTrigger>
      )}
    </TabsList>
  );
}
