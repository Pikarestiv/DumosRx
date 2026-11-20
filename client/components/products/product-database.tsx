"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProductDatabaseFilters } from "./product-database-filters";
import { ProductActionsMenu } from "./product-actions-menu";
import { AddProductDialog } from "./add-product-dialog";
import { useAddProduct } from "./use-add-product";
import { useQuery } from "@tanstack/react-query";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { useOutstandingBackorders } from "@/lib/hooks/use-outstanding-backorders";
import { getCategoryList } from "@/lib/db/queries/categories";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency as formatCurrencyWithCode } from "@/lib/utils";
import { genericFuzzySearch } from "@/lib/utils/search";
import { Product, transformProduct } from "./types";
import { CatalogList } from "./catalog-list";
import { CatalogDetailPanel } from "./catalog-detail-panel";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
import { catalogStatusLabel, matchesCatalogStatus } from "./catalog-status";
import { findDuplicateProductIds } from "@/lib/utils/duplicate-product";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { queryKeys } from "@/lib/query-keys";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useProductDatabaseNavigation } from "./use-product-database-navigation";
import {
  UNCATEGORIZED_CATEGORY_VALUE,
  UNCATEGORIZED_CATEGORY_LABEL,
  PHARMACY_DEFAULT_CATEGORIES,
  RETAIL_DEFAULT_CATEGORIES,
  CATALOG_STATUS_FILTERS,
} from "@/lib/constants/categories";

/** Matches pos-transaction-history, the other fuzzy-search surface. */
const SEARCH_DEBOUNCE_MS = 200;

export function ProductDatabase() {
  const router = useRouter();
  const { storeType, storeProfile } = useStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [searchTerm, setSearchTerm] = useState("");
  // The inputs below stay bound to searchTerm so typing is instant; the expensive work (genericFuzzySearch over the WHOLE ca…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-products-product-database-tsx-L35
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [highlightBatchId, setHighlightBatchId] = useState<string | null>(null);

  const setAddDialogOpen = useCallback((open: boolean) => {
    setShowAddDialog(open);
    if (!open) setEditingProduct(null);
  }, []);

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

  // Rationale: docs/CLIENT_COMMENTS.md#block-components-products-product-database-tsx-memo-and-layout
  const refetchProducts = useCallback(() => void refetch(), [refetch]);

  const backorders = useOutstandingBackorders();
  const owedByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of backorders) {
      if (b.outstanding > 0) map.set(b.productId, b.outstanding);
    }
    return map;
  }, [backorders]);

  // Rationale: docs/CLIENT_COMMENTS.md#block-components-products-product-database-tsx-memo-and-layout
  const handleProductDeleted = useCallback(
    (productId: string) => {
      if (selectedProduct?.id !== productId) return;
      setSelectedProduct(null);
      setEditingProduct(null);
      setShowAddDialog(false);
    },
    [selectedProduct?.id],
  );

  const products = useMemo(
    () => (rawProducts ? rawProducts.map(transformProduct) : []),
    [rawProducts],
  );

  useProductDatabaseNavigation({
    products,
    rawProducts,
    setShowAddDialog,
    setStatusFilter,
    setSelectedProduct,
    onSelectTabAndBatch: (tab, batchId) => {
      setDetailTab(tab);
      setHighlightBatchId(batchId ?? null);
    },
  });

  const liveSelectedProduct = selectedProduct
    ? (products.find((p) => p.id === selectedProduct.id) ?? selectedProduct)
    : null;

  const { data: rawCategories } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });

  const fetchedCategories = rawCategories?.map((c) => c.name) || [];

  const hasUncategorizedProducts = useMemo(
    () => products.some((p) => !p.categoryName || !p.categoryId),
    [products],
  );

  const categories = useMemo(() => {
    const defaultCats = isStore
      ? PHARMACY_DEFAULT_CATEGORIES
      : RETAIL_DEFAULT_CATEGORIES;
    const list = [
      "all",
      ...(fetchedCategories.length > 0 ? fetchedCategories : defaultCats),
    ];
    if (hasUncategorizedProducts) {
      list.push(UNCATEGORIZED_CATEGORY_VALUE);
    }
    return list;
  }, [fetchedCategories, isStore, hasUncategorizedProducts]);

  const statuses = CATALOG_STATUS_FILTERS;
  const duplicateIds = useMemo(() => findDuplicateProductIds(products), [products]);

  const { handleAddProduct, isSaving } = useAddProduct({
    refetch: () => void refetch(),
    setShowAddDialog: setAddDialogOpen,
  });

  const handleEditProduct = useCallback((product: Product) => {
    setEditingProduct(product);
    setShowAddDialog(true);
  }, []);

  const preFilteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesCategory =
          categoryFilter === "all" ||
          (categoryFilter === UNCATEGORIZED_CATEGORY_VALUE
            ? !product.categoryName || !product.categoryId
            : product.category === categoryFilter);
        return matchesCategory && matchesCatalogStatus(product, statusFilter, { owedByProduct, duplicateIds });
      }),
    [products, categoryFilter, statusFilter, owedByProduct, duplicateIds],
  );

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

  // Rationale: docs/CLIENT_COMMENTS.md#block-components-products-product-database-tsx-memo-and-layout
  const isFiltering =
    debouncedSearchTerm.trim() !== "" ||
    categoryFilter !== "all" ||
    statusFilter !== "all";

  const formatCurrency = (amount: number) =>
    formatCurrencyWithCode(amount, storeProfile?.currency);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-4">
      <div className="flex flex-col min-h-0 gap-3 lg:gap-0 h-full flex-1">
        {/* Rationale: docs/CLIENT_COMMENTS.md#block-components-products-product-database-tsx-memo-and-layout */}
        {!isDesktop && (
        <div className="lg:hidden space-y-3">
          <div className="flex items-center gap-2">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by name or SKU"
              aria-label="Search products"
              inputClassName="bg-card border-border"
            />
            <ProductActionsMenu
              onManageCategories={() => router.push("/settings/categories")}
              onProductsChanged={() => void refetch()}
              filteredProductIds={isFiltering ? filteredProducts.map((p) => p.id) : undefined}
              labelProducts={filteredProducts}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              label="Category"
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              options={categories.map((c) => ({
                value: c,
                label:
                  c === "all"
                    ? "All"
                    : c === UNCATEGORIZED_CATEGORY_VALUE
                      ? UNCATEGORIZED_CATEGORY_LABEL
                      : c,
              }))}
              className="bg-card"
            />
            <FilterPill
              label="Inventory"
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={statuses.map((s) => ({
                value: s,
                label: catalogStatusLabel(s, { owed: owedByProduct.size, duplicates: duplicateIds.size }),
              }))}
              className="bg-card"
            />
          </div>
        </div>
        )}

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
            owedCount={owedByProduct.size}
            duplicateCount={duplicateIds.size}
            onManageCategories={() => router.push("/settings/categories")}
            onProductsChanged={() => void refetch()}
            filteredProductIds={isFiltering ? filteredProducts.map((p) => p.id) : undefined}
            labelProducts={filteredProducts}
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
            onEditProduct={handleEditProduct}
            selectedProductId={selectedProduct?.id}
            sortKey={sortKey}
            sortDirection={direction}
            onToggleSort={toggleSort}
            onProductUpdated={refetchProducts}
            onProductDeleted={handleProductDeleted}
            owedByProduct={owedByProduct}
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
          product={liveSelectedProduct}
          className="border-none rounded-none"
          onEditProduct={handleEditProduct}
          onClose={() => {
            setSelectedProduct(null);
            setHighlightBatchId(null);
          }}
          activeTab={detailTab}
          onTabChange={setDetailTab}
          highlightBatchId={highlightBatchId}
        />
      </ResponsiveDetailPanel>

      <AddProductDialog
        open={showAddDialog}
        onOpenChange={setAddDialogOpen}
        onAddProduct={handleAddProduct}
        editingProduct={editingProduct && (products.find((p) => p.id === editingProduct.id) ?? editingProduct)}
        isSubmitting={isSaving}
      />
    </div>
  );
}
