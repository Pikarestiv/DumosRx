"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ProductDatabaseFilters } from "./product-database-filters";
import { AddProductDialog } from "./add-product-dialog";
import { useAddProduct } from "./use-add-product";
import { useQuery } from "@tanstack/react-query";
import { getProductsWithDetails, getCategoriesList } from "@/lib/db/queries/products";
import { useStore } from "@/lib/context/store-context";
import { genericFuzzySearch } from "@/lib/utils/search";
import { Product, transformProduct } from "./types";
import { CatalogList } from "./catalog-list";
import { CatalogDetailPanel } from "./catalog-detail-panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function ProductDatabase() {
  const { t, storeType } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
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

  const { data: rawProducts, refetch } = useQuery({
    queryKey: ['productsWithDetails'],
    queryFn: () => getProductsWithDetails()
  });
  
  const products = rawProducts ? rawProducts.map(transformProduct) : [];

  const { data: rawCategories } = useQuery({
    queryKey: ['categoriesList'],
    queryFn: () => getCategoriesList()
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
    "expired",
    "low_stock",
    "out_of_stock",
  ];

  const { handleAddProduct } = useAddProduct({
    refetch,
    setShowAddDialog,
    setSelectedProduct,
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

    return matchesCategory && matchesStatus;
  });

  const { results: filteredProducts, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredProducts,
    ["name", "genericName", "brand", "nafdacNumber", "barcode", "id"],
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize(); // Set initial value
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[600px] space-y-4">


      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_450px] gap-5 flex-1 min-h-0">
        {/* Left List */}
        <div className="bg-card border border-border rounded-2xl flex flex-col min-h-0">
          <ProductDatabaseFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            categories={categories}
            statuses={statuses}
          />
          <CatalogList
            filteredProducts={filteredProducts}
            totalCount={products.length}
            isFuzzyFallback={isFuzzyFallback}
            formatCurrency={formatCurrency}
            onSelectProduct={setSelectedProduct}
            selectedProductId={selectedProduct?.id}
          />
        </div>
        
        {/* Desktop Detail Panel */}
        <div className="hidden lg:flex flex-col min-h-0">
          <CatalogDetailPanel 
            product={selectedProduct} 
            onEditProduct={handleEditProduct} 
          />
        </div>
      </div>

      {/* Mobile Detail Panel (Sheet) */}
      <Sheet open={!!selectedProduct && isMobile} onOpenChange={(open) => {
        if (!open) setSelectedProduct(null);
      }}>
        <SheetContent side="right" className="w-full sm:w-[400px] p-0 flex flex-col bg-muted/30">
          <CatalogDetailPanel 
            product={selectedProduct} 
            onEditProduct={(p) => {
              handleEditProduct(p);
            }} 
          />
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <AddProductDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setSelectedProduct(null);
        }}
        onAddProduct={handleAddProduct}
        editingProduct={selectedProduct}
      />
    </div>
  );
}
