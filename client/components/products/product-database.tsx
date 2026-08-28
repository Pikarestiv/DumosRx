"use client";

import { useState, useEffect } from "react";
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
import { genericFuzzySearch } from "@/lib/utils/search";
import { getExpiryStatus } from "@/lib/utils/date-utils";
import { Product, transformProduct } from "./types";
import { CatalogList } from "./catalog-list";
import { CatalogDetailPanel } from "./catalog-detail-panel";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill, formatFilterLabel } from "@/components/ui/filter-pill";
import { ManageCategoriesDialog } from "./manage-categories-dialog";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { queryKeys } from "@/lib/query-keys";
import { useSortableData } from "@/lib/hooks/use-sortable-data";

export function ProductDatabase() {
  const { storeType } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);
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

  const { data: rawProducts, refetch } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
  });

  const products = rawProducts ? rawProducts.map(transformProduct) : [];

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

  const { handleAddProduct } = useAddProduct({
    refetch,
    setShowAddDialog,
  });

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setShowAddDialog(true);
  };

  const preFilteredProducts = products.filter((product) => {
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
      new Date(product.expiryDate) < new Date()
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

  const { results: searchedProducts, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredProducts,
    ["name", "genericName", "nafdacNumber", "barcode", "id"],
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex flex-col lg:flex-1 lg:min-h-0 lg:h-full gap-4">
      <div className="flex flex-col min-h-0 gap-3 lg:gap-0 lg:h-full flex-1">
        {/* Mobile: search bar + filter pills stand alone above the card, contrasting with the page background */}
        <div className="lg:hidden space-y-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by name or SKU"
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

        <div className="border-0 sm:border sm:border-border bg-transparent sm:bg-card rounded-none sm:rounded-2xl flex flex-col min-h-0 lg:flex-1">
          <ProductDatabaseFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            categories={categories}
            statuses={statuses}
            onManageCategories={() => setShowManageCategories(true)}
          />
          <CatalogList
            filteredProducts={filteredProducts}
            totalCount={products.length}
            isFuzzyFallback={isFuzzyFallback}
            formatCurrency={formatCurrency}
            onSelectProduct={setSelectedProduct}
            selectedProductId={selectedProduct?.id}
            sortKey={sortKey}
            sortDirection={direction}
            onToggleSort={toggleSort}
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
      />
      <ManageCategoriesDialog
        open={showManageCategories}
        onOpenChange={setShowManageCategories}
      />
    </div>
  );
}
