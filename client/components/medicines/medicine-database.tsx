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
import { AddMedicineDialog } from "./add-medicine-dialog";
import { MedicineDetailsDialog } from "./medicine-details-dialog";
import { insert, update, query } from "@/lib/db/local-database";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";
import { genericFuzzySearch } from "@/lib/utils/search";
import { Medicine, transformMedicine } from "./types";
import { MedicineStatsCards } from "./medicine-stats-cards";
import { MedicineTable } from "./medicine-table";

export function MedicineDatabase() {
  const { t, storeType } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(
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

  const isStore = storeType === "store";

  const {
    data: medicines,
    refetch,
  } = useLocalData<Medicine>(
    `SELECT m.*, c.name as category_name, v.name as supplier_name
     FROM medicines m
     LEFT JOIN categories c ON m.category_id = c.id
     LEFT JOIN vendors v ON m.supplier_id = v.id
     WHERE m._deleted = 0
     ORDER BY m.created_at DESC`,
    [],
    { transform: transformMedicine },
  );

  const categories = isStore 
    ? ["all", "Analgesics", "Antibiotics", "Antimalarials", "Vitamins", "Antacids"]
    : ["all", "Groceries", "Beverages", "Personal Care", "Household", "Snacks", "Dairy"];
    
  const statuses = ["all", "active", "inactive", "expired", "low_stock"];

  const handleAddMedicine = async (payload: any) => {
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

      // Resolve supplier string to UUID (maps to client vendors table)
      if (payload.supplier_id) {
        const supplierName = payload.supplier_id.trim();
        const existing = await query<any>("SELECT id FROM vendors WHERE name = ? AND _deleted = 0", [supplierName]);
        if (existing && existing.length > 0) {
          localPayload.supplier_id = existing[0].id;
        } else {
          const newId = crypto.randomUUID();
          await insert("vendors", {
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

      if (isEditing) {
        const id = localPayload.id;
        delete localPayload.id;
        // Use generic update from base-helpers (which is re-exported by local-database)
        await update("medicines", id, localPayload);
        toast.success(`${t('product')} updated successfully`);
      } else {
        await insert("medicines", localPayload);
        toast.success(`${t('product')} added successfully`);
      }

      refetch();
      setShowAddDialog(false);
      setSelectedMedicine(null);
    } catch (error) {
      console.error(`Failed to save ${t('product')}:`, error);
      toast.error(`Failed to save ${t('product')}.`);
    }
  };

  const handleEditMedicine = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setShowAddDialog(true);
  };

  const preFilteredMedicines = medicines.filter((medicine) => {
    const matchesCategory =
      categoryFilter === "all" || medicine.category === categoryFilter;
    
    let matchesStatus = statusFilter === "all" || medicine.status === statusFilter;
    
    // Explicit overrides for inclusive filtering
    if (statusFilter === "low_stock" && medicine.stockQuantity <= medicine.reorderLevel) {
      matchesStatus = true;
    }
    if (statusFilter === "expired" && medicine.expiryDate && new Date(medicine.expiryDate) < new Date()) {
      matchesStatus = true;
    }

    return matchesCategory && matchesStatus;
  });

  const { results: filteredMedicines, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredMedicines,
    ["name", "genericName", "brand", "nafdacNumber"]
  );

  const getStatusBadge = (status: Medicine["status"]) => {
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

  const handleViewDetails = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
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
            Manage your store's {t('products').toLowerCase()} inventory and information
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
      <MedicineStatsCards
        totalCount={medicines.length}
        activeCount={medicines.filter((m) => m.status !== "expired").length}
        lowStockCount={medicines.filter((m) => m.stockQuantity <= m.reorderLevel).length}
        expiredCount={medicines.filter((m) => m.expiryDate && new Date(m.expiryDate) < new Date()).length}
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

      {/* Medicine Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            {t('products')} Inventory
          </CardTitle>
          <CardDescription>
            Showing {filteredMedicines.length} of {medicines.length} {t('products').toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MedicineTable
            filteredMedicines={filteredMedicines}
            totalCount={medicines.length}
            isFuzzyFallback={isFuzzyFallback}
            isStore={isStore}
            formatCurrency={formatCurrency}
            getStatusBadge={getStatusBadge}
            onViewDetails={handleViewDetails}
            onEditMedicine={handleEditMedicine}
            productLabel={t('product')}
            productsLabel={t('products')}
            stockLabel={t('stock')}
            categoryLabel={t('category')}
            regNumLabel={t('registration_number')}
          />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddMedicineDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setSelectedMedicine(null);
        }}
        onAddMedicine={handleAddMedicine}
        editingMedicine={selectedMedicine}
      />

      <MedicineDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        medicine={selectedMedicine}
      />
    </div>
  );
}
