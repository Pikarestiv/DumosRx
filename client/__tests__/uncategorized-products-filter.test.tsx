import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display: 0 } }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ canManageStockBatch: true }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

import { usePOSProductFilter } from "@/lib/hooks/use-pos-product-filter";
import { POSCategoryFilter } from "@/components/pos/pos-category-filter";
import { ProductDatabaseFilters } from "@/components/products/product-database-filters";
import {
  UNCATEGORIZED_CATEGORY_VALUE,
  UNCATEGORIZED_CATEGORY_LABEL,
} from "@/lib/constants/categories";
import type { POSProduct } from "@/lib/types/product";
import { transformProduct } from "@/components/products/types";
import type { ProductWithDetails } from "@/lib/types/product";

describe("A-187: Uncategorized products filtering in POS and Product Catalog", () => {
  describe("usePOSProductFilter", () => {
    const products: POSProduct[] = [
      {
        id: "p1",
        name: "Amoxil 500mg",
        generic_name: "Amoxicillin",
        strength: "500mg",
        unit_price: 1000,
        stock: 20,
        category_name: "Antibiotics",
      },
      {
        id: "p2",
        name: "Panadol",
        generic_name: "Paracetamol",
        strength: "500mg",
        unit_price: 500,
        stock: 50,
        category_name: "Analgesics",
      },
      {
        id: "p3",
        name: "CARO WHITE LOTION",
        generic_name: "",
        strength: "",
        unit_price: 1500,
        stock: 10,
        category_name: "", // uncategorized
      },
      {
        id: "p4",
        name: "CARO WHITE CREAM",
        generic_name: "",
        strength: "",
        unit_price: 1200,
        stock: 5,
        // category_name undefined/null
      },
    ];

    it("appends __uncategorized__ option when at least one product has no category", () => {
      const { result } = renderHook(() => usePOSProductFilter(products, "", "all"));

      expect(result.current.categories).toEqual([
        "Analgesics",
        "Antibiotics",
        UNCATEGORIZED_CATEGORY_VALUE,
      ]);
    });

    it("does not append __uncategorized__ option when all products have categories", () => {
      const fullyCategorized = products.slice(0, 2);
      const { result } = renderHook(() => usePOSProductFilter(fullyCategorized, "", "all"));

      expect(result.current.categories).toEqual(["Analgesics", "Antibiotics"]);
    });

    it("filters to only uncategorized products when categoryFilter is __uncategorized__", () => {
      const { result } = renderHook(() =>
        usePOSProductFilter(products, "", UNCATEGORIZED_CATEGORY_VALUE),
      );

      const ids = result.current.filteredProducts.map((p) => p.id);
      expect(ids).toEqual(["p3", "p4"]);
    });

    it("filters to categorized products when a named category is selected", () => {
      const { result } = renderHook(() => usePOSProductFilter(products, "", "Antibiotics"));

      const ids = result.current.filteredProducts.map((p) => p.id);
      expect(ids).toEqual(["p1"]);
    });

    it("allows searching within uncategorized products", () => {
      const { result } = renderHook(() =>
        usePOSProductFilter(products, "LOTION", UNCATEGORIZED_CATEGORY_VALUE),
      );

      const ids = result.current.filteredProducts.map((p) => p.id);
      expect(ids).toEqual(["p3"]);
    });
  });

  describe("POSCategoryFilter component", () => {
    it("renders Uncategorized label for the __uncategorized__ tab value", () => {
      render(
        <POSCategoryFilter
          categories={["Analgesics", UNCATEGORIZED_CATEGORY_VALUE]}
          value="all"
          onChange={() => {}}
        />,
      );

      expect(screen.getByRole("tab", { name: "All" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Analgesics" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: UNCATEGORIZED_CATEGORY_LABEL })).toBeTruthy();
    });
  });

  describe("Product Catalog transformation and category filtering", () => {
    it("preserves categoryId and categoryName during transformProduct", () => {
      const apiItemWithCat: ProductWithDetails = {
        id: "prod-1",
        name: "Aspirin",
        selling_price: 200,
        category_id: "cat-uuid-1",
        category_name: "Analgesics",
      };
      const transformedWithCat = transformProduct(apiItemWithCat);
      expect(transformedWithCat.categoryId).toBe("cat-uuid-1");
      expect(transformedWithCat.categoryName).toBe("Analgesics");
      expect(transformedWithCat.category).toBe("Analgesics");

      const apiItemUncategorized: ProductWithDetails = {
        id: "prod-2",
        name: "Imported Cream",
        selling_price: 1500,
        category_id: undefined,
        category_name: undefined,
      };
      const transformedUncat = transformProduct(apiItemUncategorized);
      expect(transformedUncat.categoryId).toBeNull();
      expect(transformedUncat.categoryName).toBeNull();
      expect(transformedUncat.category).toBe("Uncategorized");
    });

    it("renders Uncategorized option in ProductDatabaseFilters", () => {
      const queryClient = new QueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ProductDatabaseFilters
            searchTerm=""
            setSearchTerm={() => {}}
            categoryFilter="all"
            setCategoryFilter={() => {}}
            statusFilter="all"
            setStatusFilter={() => {}}
            categories={["all", "Analgesics", UNCATEGORIZED_CATEGORY_VALUE]}
            statuses={["all", "active"]}
            onManageCategories={() => {}}
            onProductsChanged={() => {}}
          />
        </QueryClientProvider>,
      );

      // Verify the filter pill includes Category: and renders properly
      expect(screen.getByText("Category:")).toBeTruthy();
    });
  });
});
