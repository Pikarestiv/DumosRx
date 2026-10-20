"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/lib/hooks/use-permissions";

/** Tab nav only; pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function POSMainTabNav() {
  // Unconditional top-level const (see pos-cart.tsx's canApplyDiscounts).
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-main-tab-nav-tsx-L8
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
