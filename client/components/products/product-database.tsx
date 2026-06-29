"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { ProductDatabaseFilters } from "./product-database-filters";
import { AddProductDialog } from "./add-product-dialog";
import { ProductDetailsDialog } from "./product-details-dialog";
import { useAddProduct } from "./use-add-product";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";
import { genericFuzzySearch } from "@/lib/utils/search";
import { Product, transformProduct } from "./types";
import { ProductStatsCards } from "./product-stats-cards";
import { ProductTable } from "./product-table";

export function ProductDatabase() {
  const { t, storeType } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter]);

  const isStore = storeType === "pharmacy";

  const { data: products, refetch } = useLocalData<Product>(
    `SELECT m.*, c.name as category_name, v.name as supplier_name,
       (SELECT SUM(quantity) FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND is_active = 1) as stock_quantity,
       (SELECT cost_price FROM stock_batches WHERE product_id = m.id AND _deleted = 0 ORDER BY created_at DESC LIMIT 1) as cost_price,
       (SELECT expiry_date FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1) as expiry_date,
       (SELECT batch_number FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1) as batch_number
     FROM products m
     LEFT JOIN categories c ON m.category_id = c.id
     LEFT JOIN suppliers v ON m.supplier_id = v.id
     WHERE m._deleted = 0
     ORDER BY m.created_at DESC`,
    [],
    { transform: transformProduct },
  );

  const { data: rawCategories } = useLocalData<any>(
    "SELECT name FROM categories WHERE _deleted = 0 ORDER BY name ASC",
  );

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
    ["name", "genericName", "brand", "nafdacNumber"],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: Product["status"]) => {
    let variant: "default" | "secondary" | "destructive" | "outline" =
      "default";
    let label = "Active";

    switch (status) {
      case "active":
        variant = "default";
        label = "Active";
        break;
      case "inactive":
        variant = "secondary";
        label = "Inactive";
        break;
      case "expired":
        variant = "destructive";
        label = "Expired";
        break;
      case "low_stock":
        variant = "outline";
        label = "Low Stock";
        break;
      case "out_of_stock":
        variant = "destructive";
        label = "Out of Stock";
        break;
    }

    return (
      <Badge variant={variant} className="text-xs">
        {label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleViewDetails = (product: Product) => {
    setSelectedProduct(product);
    setShowDetailsDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">
            {t("products")} Database
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your store's {t("products").toLowerCase()} inventory and
            information
          </p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-accent hover:bg-accent/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add {t("product")}
        </Button>
      </div>

      {/* Statistics Cards */}
      <ProductStatsCards
        totalCount={products.length}
        activeCount={products.filter((m) => m.status !== "expired").length}
        lowStockCount={
          products.filter(
            (m) => m.stockQuantity > 0 && m.stockQuantity <= m.reorderLevel,
          ).length
        }
        outOfStockCount={products.filter((m) => m.stockQuantity <= 0).length}
        expiredCount={
          products.filter(
            (m) => m.expiryDate && new Date(m.expiryDate) < new Date(),
          ).length
        }
        productsLabel={t("products")}
      />

      {/* Search and Filters */}
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

      {/* Product Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            {t("products")} Stock Batch
          </CardTitle>
          <CardDescription>
            Showing {filteredProducts.length} of {products.length}{" "}
            {t("products").toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProductTable
            filteredProducts={paginatedProducts}
            totalCount={products.length}
            isFuzzyFallback={isFuzzyFallback}
            isStore={isStore}
            formatCurrency={formatCurrency}
            getStatusBadge={getStatusBadge}
            onViewDetails={handleViewDetails}
            onEditProduct={handleEditProduct}
            productLabel={t("product")}
            productsLabel={t("products")}
            stockLabel={t("stock")}
            categoryLabel={t("category")}
            regNumLabel={t("registration_number")}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredProducts.length)} of{" "}
                {filteredProducts.length} entries
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center justify-center text-sm font-medium px-4">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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

      <ProductDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        product={selectedProduct}
      />
    </div>
  );
}
