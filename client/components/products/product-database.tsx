"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { SearchableInput } from "@/components/ui/searchable-input";
import { AddProductDialog } from "./add-product-dialog";
import { ProductDetailsDialog } from "./product-details-dialog";
import { insert, update, query } from "@/lib/db/local-database";
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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    null,
  );
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setShowAddDialog(true);
      // Clean up the URL
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl = window.location.pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }
    
    const status = searchParams.get("status");
    if (status) {
      setStatusFilter(status);
    }
  }, [searchParams, router]);

  const isStore = storeType === "pharmacy";

  const {
    data: products,
    refetch,
  } = useLocalData<Product>(
    `SELECT m.*, c.name as category_name, v.name as supplier_name
     FROM products m
     LEFT JOIN categories c ON m.category_id = c.id
     LEFT JOIN suppliers v ON m.supplier_id = v.id
     WHERE m._deleted = 0
     ORDER BY m.created_at DESC`,
    [],
    { transform: transformProduct },
  );

  const { data: rawCategories } = useLocalData<any>(
    "SELECT name FROM categories WHERE _deleted = 0 ORDER BY name ASC"
  );

  const defaultCategories = isStore 
    ? ["Analgesics", "Antibiotics", "Antimalarials", "Vitamins", "Antacids"]
    : ["Groceries", "Beverages", "Personal Care", "Household", "Snacks", "Dairy"];
    
  const fetchedCategories = rawCategories?.map(c => c.name) || [];
  
  const categories = [
    "all", 
    ...(fetchedCategories.length > 0 ? fetchedCategories : defaultCategories)
  ];
    
  const statuses = ["all", "active", "inactive", "expired", "low_stock"];

  const handleAddProduct = async (payload: any) => {
    try {
      const isEditing = !!payload.id;
      
      // Create locally
      const localPayload = {
        ...payload,
        is_active: payload.status === "inactive" ? 0 : 1,
      };
      delete localPayload.status;

      // Resolve category string to UUID
      if (payload.category_id) {
        const categoryName = payload.category_id.trim();
        const existing = await query<any>("SELECT id FROM categories WHERE name = ? AND _deleted = 0", [categoryName]);
        if (existing && existing.length > 0) {
          localPayload.category_id = existing[0].id;
        } else {
          const newId = crypto.randomUUID();
          await insert("categories", {
            id: newId,
            name: categoryName,
            is_active: 1,
            created_at: new Date().toISOString(),
          });
          localPayload.category_id = newId;
        }
      } else {
        localPayload.category_id = null;
      }

      // Resolve supplier string to UUID (maps to client suppliers table)
      if (payload.supplier_id) {
        const supplierName = payload.supplier_id.trim();
        const existing = await query<any>("SELECT id FROM suppliers WHERE name = ? AND _deleted = 0", [supplierName]);
        if (existing && existing.length > 0) {
          localPayload.supplier_id = existing[0].id;
        } else {
          const newId = crypto.randomUUID();
          await insert("suppliers", {
            id: newId,
            name: supplierName,
            is_active: 1,
            created_at: new Date().toISOString(),
          });
          localPayload.supplier_id = newId;
        }
      } else {
        localPayload.supplier_id = null;
      }

      const initialStock = localPayload.stock_quantity;
      const initialExpiry = localPayload.expiry_date;
      const initialBatch = localPayload.batch_number;

      delete localPayload.stock_quantity;
      delete localPayload.expiry_date;
      delete localPayload.batch_number;

      if (isEditing) {
        const id = localPayload.id;
        delete localPayload.id;
        // Use generic update from base-helpers (which is re-exported by local-database)
        await update("products", id, localPayload);
        toast.success(`${t('product')} updated successfully`);
      } else {
        const productId = await insert("products", localPayload);
        
        // Also create an initial stock batch if there's stock
        if (initialStock > 0) {
          await insert("stock_batches", {
            product_id: productId,
            quantity: initialStock,
            cost_price: localPayload.cost_price || 0,
            selling_price: localPayload.selling_price || 0,
            batch_number: initialBatch || "INITIAL",
            expiry_date: initialExpiry || new Date(Date.now() + 365*2*24*60*60*1000).toISOString().split('T')[0],
            is_active: 1
          });
        }
        toast.success(`${t('product')} added successfully`);
      }

      refetch();
      setShowAddDialog(false);
      setSelectedProduct(null);
    } catch (error) {
      console.error(`Failed to save ${t('product')}:`, error);
      toast.error(`Failed to save ${t('product')}.`);
    }
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setShowAddDialog(true);
  };

  const preFilteredProducts = products.filter((product) => {
    const matchesCategory =
      categoryFilter === "all" || product.category === categoryFilter;
    
    let matchesStatus = statusFilter === "all" || product.status === statusFilter;
    
    // Explicit overrides for inclusive filtering
    if (statusFilter === "low_stock" && product.stockQuantity <= product.reorderLevel) {
      matchesStatus = true;
    }
    if (statusFilter === "expired" && product.expiryDate && new Date(product.expiryDate) < new Date()) {
      matchesStatus = true;
    }

    return matchesCategory && matchesStatus;
  });

  const { results: filteredProducts, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredProducts,
    ["name", "genericName", "brand", "nafdacNumber"]
  );

  const getStatusBadge = (status: Product["status"]) => {
    let variant: "default" | "secondary" | "destructive" | "outline" = "default";
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
            {t('products')} Database
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your store's {t('products').toLowerCase()} stock_batch and information
          </p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-accent hover:bg-accent/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add {t('product')}
        </Button>
      </div>

      {/* Statistics Cards */}
      <ProductStatsCards
        totalCount={products.length}
        activeCount={products.filter((m) => m.status !== "expired").length}
        lowStockCount={products.filter((m) => m.stockQuantity <= m.reorderLevel).length}
        expiredCount={products.filter((m) => m.expiryDate && new Date(m.expiryDate) < new Date()).length}
        productsLabel={t('products')}
      />

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Search & Filter
          </CardTitle>
          <CardDescription>
            Find {t('products').toLowerCase()} by name, brand, {t('registration_number').toLowerCase()}, or other criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={`Search ${t('products').toLowerCase()}, brands, ${t('registration_number').toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-56">
              <SearchableInput
                options={categories.map(c => ({
                  label: c === "all" ? `All ${t('category')}s` : c,
                  value: c
                }))}
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                placeholder={`All ${t('category')}s`}
              />
            </div>
            <div className="w-full md:w-56">
              <SearchableInput
                options={statuses.map(s => ({
                  label: s === "all" ? "All Status" : s.replace("_", " ").split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                  value: s
                }))}
                value={statusFilter}
                onValueChange={setStatusFilter}
                placeholder="All Status"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            {t('products')} StockBatch
          </CardTitle>
          <CardDescription>
            Showing {filteredProducts.length} of {products.length} {t('products').toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductTable
            filteredProducts={filteredProducts}
            totalCount={products.length}
            isFuzzyFallback={isFuzzyFallback}
            isStore={isStore}
            formatCurrency={formatCurrency}
            getStatusBadge={getStatusBadge}
            onViewDetails={handleViewDetails}
            onEditProduct={handleEditProduct}
            productLabel={t('product')}
            productsLabel={t('products')}
            stockLabel={t('stock')}
            categoryLabel={t('category')}
            regNumLabel={t('registration_number')}
          />
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
