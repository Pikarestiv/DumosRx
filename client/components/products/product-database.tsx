"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProductDatabaseFilters } from "./product-database-filters";
import { AddProductDialog } from "./add-product-dialog";
import { useAddProduct } from "./use-add-product";
import { useQuery } from "@tanstack/react-query";
import {
  getProductsWithDetails,
  getCategoriesList,
} from "@/lib/db/queries/products";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency as formatCurrencyWithCode } from "@/lib/utils";
import { genericFuzzySearch } from "@/lib/utils/search";
import { getExpiryStatus } from "@/lib/utils/date-utils";
import { Product, transformProduct } from "./types";
import { CatalogList } from "./catalog-list";
import { CatalogDetailPanel } from "./catalog-detail-panel";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill, formatFilterLabel } from "@/components/ui/filter-pill";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { queryKeys } from "@/lib/query-keys";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

/** Matches pos-transaction-history, the other fuzzy-search surface. */
const SEARCH_DEBOUNCE_MS = 200;

export function ProductDatabase() {
  const { storeType, storeProfile } = useStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [searchTerm, setSearchTerm] = useState("");
  // The inputs below stay bound to searchTerm so typing is instant; the
  // expensive work (genericFuzzySearch over the WHOLE catalog, whose Tier-4
  // Levenshtein fallback fires exactly while a user is mid-word, on the same
  // main thread as synchronous sql.js) runs off the settled value instead.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setShowAddDialog(true);
      // Clean up the URL
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl =
        window.location.pathname +
        (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }

    const status = searchParams.get("status");
    if (status) {
      setStatusFilter(status);
    }
  }, [searchParams, router]);

  const isStore = storeType === "pharmacy";

  const {
    data: rawProducts,
    isLoading: productsLoading,
    isError: productsLoadFailed,
    refetch,
  } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
  });

  // Stable identity: this is a prop of CatalogList, which hands it down to the
  // memoized CatalogRow. An inline arrow here made every row's save handler
  // fresh on each render and defeated that memo.
  const refetchProducts = useCallback(() => void refetch(), [refetch]);

  // Transform -> pre-filter -> fuzzy search all used to re-run on every
  // render, i.e. on every keystroke in the product search, over the whole
  // catalog. Each stage is now keyed on its real inputs.
  const products = useMemo(
    () => (rawProducts ? rawProducts.map(transformProduct) : []),
    [rawProducts],
  );

  // Deep-link from Dashboard's "Product added" activity rows
  // (dashboard-overview.tsx): opens that product's detail panel once its
  // data has loaded, then cleans up the URL the same way `?action=add` does
  // above.
  useEffect(() => {
    const productId = searchParams.get("productId");
    if (!productId || !rawProducts) return;

    const match = products.find((p) => p.id === productId);
    if (match) {
      setSelectedProduct(match);
    }

    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("productId");
    const newUrl =
      window.location.pathname +
      (newParams.toString() ? `?${newParams.toString()}` : "");
    router.replace(newUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rawProducts, router]);

  const { data: rawCategories } = useQuery({
    ...queryKeys.categories.all(),
    queryFn: () => getCategoriesList(),
  });

  const defaultCategories = isStore
    ? ["Analgesics", "Antibiotics", "Antimalarials", "Vitamins", "Antacids"]
    : [
        "Groceries",
        "Beverages",
        "Personal Care",
        "Household",
        "Snacks",
        "Dairy",
      ];

  const fetchedCategories = rawCategories?.map((c) => c.name) || [];

  const categories = [
    "all",
    ...(fetchedCategories.length > 0 ? fetchedCategories : defaultCategories),
  ];

  const statuses = [
    "all",
    "active",
    "inactive",
    "expiring_soon",
    "expired",
    "low_stock",
    "out_of_stock",
  ];

  const { handleAddProduct, isSaving } = useAddProduct({
    refetch: () => void refetch(),
    setShowAddDialog,
  });

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setShowAddDialog(true);
  };

  const preFilteredProducts = useMemo(() => {
    const now = new Date();
    return products.filter((product) => {
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;

      let matchesStatus =
        statusFilter === "all" || product.status === statusFilter;

      // Explicit overrides for inclusive filtering
      if (
        statusFilter === "low_stock" &&
        product.stockQuantity <= product.reorderLevel
      ) {
        matchesStatus = true;
      }
      if (
        statusFilter === "expired" &&
        product.expiryDate &&
        new Date(product.expiryDate) < now
      ) {
        matchesStatus = true;
      }
      if (
        statusFilter === "expiring_soon" &&
        product.expiryDate &&
        getExpiryStatus(product.expiryDate) === "expiring_soon"
      ) {
        matchesStatus = true;
      }

      return matchesCategory && matchesStatus;
    });
  }, [products, categoryFilter, statusFilter]);

  const { results: searchedProducts, isFuzzyFallback } = useMemo(
    () =>
      genericFuzzySearch(debouncedSearchTerm, preFilteredProducts, [
        "name",
        "genericName",
        "nafdacNumber",
        "barcode",
        "id",
      ]),
    [debouncedSearchTerm, preFilteredProducts],
  );

  const { sortKey, direction, toggleSort, sortedData: filteredProducts } =
    useSortableData(searchedProducts, {
      name: (p: Product) => p.name.toLowerCase(),
      category: (p: Product) => p.category.toLowerCase(),
      costPrice: (p: Product) => p.costPrice,
      sellingPrice: (p: Product) => p.sellingPrice,
      stockQuantity: (p: Product) => p.stockQuantity,
      reorderLevel: (p: Product) => p.reorderLevel,
    });

  // Debounced, not raw: this gates filteredProductIds, which is derived from
  // the debounced search, so the raw term would claim "filtering" for a frame
  // while filteredProducts still held the unfiltered list.
  const isFiltering =
    debouncedSearchTerm.trim() !== "" ||
    categoryFilter !== "all" ||
    statusFilter !== "all";

  const formatCurrency = (amount: number) =>
    formatCurrencyWithCode(amount, storeProfile?.currency);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-4">
      <div className="flex flex-col min-h-0 gap-3 lg:gap-0 h-full flex-1">
        {/* Mobile: search bar + filter pills stand alone above the card,
            contrasting with the page background. Conditionally rendered, not
            just CSS-hidden: this and ProductDatabaseFilters below are bound to
            the same searchTerm state, so leaving both mounted re-rendered two
            full filter bars on every keystroke. The lg:hidden class stays as
            the first-frame guard, since useMediaQuery starts at false. */}
        {!isDesktop && (
        <div className="lg:hidden space-y-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by name or SKU"
            aria-label="Search products"
            inputClassName="bg-card border-border"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              label="Category"
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              options={categories.map((c) => ({
                value: c,
                label: c === "all" ? "All" : c,
              }))}
              className="bg-card"
            />
            <FilterPill
              label="Inventory"
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={statuses.map((s) => ({
                value: s,
                label: formatFilterLabel(s),
              }))}
              className="bg-card"
            />
          </div>
        </div>
        )}

        {/* flex-1 already fills exactly the space left after the tabs/header
            above (verified live) — min-h-[360px] is the only bound that
            should normally bind, keeping the table usable on a short
            window. max-h is a fixed px edge-case rail against an absurdly
            tall/ultrawide monitor, not a percentage of viewport height: a
            vh-based cap (e.g. 75vh) is *always* less than the true
            remaining space once the header/tabs are subtracted, so it was
            binding on every normal screen and undoing the fill instead of
            only guarding the extreme case. */}
        <div className="border-0 sm:border sm:border-border bg-transparent sm:bg-card rounded-none sm:rounded-2xl flex flex-col flex-1 min-h-[360px] lg:max-h-[900px]">
          {isDesktop && (
          <ProductDatabaseFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            categories={categories}
            statuses={statuses}
            onManageCategories={() => router.push("/settings/categories")}
            onProductsChanged={() => void refetch()}
            filteredProductIds={isFiltering ? filteredProducts.map((p) => p.id) : undefined}
          />
          )}
          <CatalogList
            isLoading={productsLoading}
            loadFailed={productsLoadFailed}
            onRetryLoad={refetchProducts}
            filteredProducts={filteredProducts}
            totalCount={products.length}
            isFuzzyFallback={isFuzzyFallback}
            formatCurrency={formatCurrency}
            onSelectProduct={setSelectedProduct}
            selectedProductId={selectedProduct?.id}
            sortKey={sortKey}
            sortDirection={direction}
            onToggleSort={toggleSort}
            onProductUpdated={refetchProducts}
          />
        </div>
      </div>

      <ResponsiveDetailPanel
        open={!!selectedProduct}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
        }}
      >
        <CatalogDetailPanel
          product={selectedProduct}
          className="border-none rounded-none"
          onEditProduct={handleEditProduct}
          onClose={() => setSelectedProduct(null)}
        />
      </ResponsiveDetailPanel>

      {/* Dialogs */}
      <AddProductDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddProduct={handleAddProduct}
        editingProduct={selectedProduct}
        isSubmitting={isSaving}
      />
    </div>
  );
}
