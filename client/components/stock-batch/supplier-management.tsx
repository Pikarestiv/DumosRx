"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { getSuppliers, createSupplier } from "@/lib/db/local-database";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useStore } from "@/lib/context/store-context";
import { SupplierStats } from "./supplier-stats";
import { SupplierTable } from "./supplier-table";
import { genericFuzzySearch } from "@/lib/utils/search";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string;
  paymentTerms: string;
  rating: number;
}

const transformSupplier = (apiData: any): Supplier => ({
  id: apiData.id,
  name: apiData.name,
  contactPerson: apiData.contact_person || "",
  email: apiData.email || "",
  phone: apiData.phone || "",
  address: apiData.address || "",
  city: apiData.city || "",
  state: apiData.state || "",
  status: apiData.is_active ? "active" : "inactive",
  totalOrders: 0,
  totalValue: 0,
  lastOrderDate: new Date().toISOString(),
  paymentTerms: apiData.payment_terms || "30 days",
  rating: isNaN(Number(apiData.rating)) ? 5.0 : Number(apiData.rating),
});

export function SupplierManagement() {
  const { t } = useStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasDebtFilter, setHasDebtFilter] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data } = await getSuppliers(1, 100);
      const transformed = data.map(transformSupplier);
      setSuppliers(transformed);
    } catch (error) {
      console.error("Failed to fetch suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async (payload: any) => {
    try {
      const newId = await createSupplier(payload);
      const newSupplier = transformSupplier({ ...payload, id: newId });
      setSuppliers([newSupplier, ...suppliers]);
      setShowAddDialog(false);
    } catch (error) {
      console.error("Failed to create supplier:", error);
    }
  };

  const preFilteredSuppliers = suppliers.filter((s) => {
    // For now, mock the debt filter (e.g. if their ID ends with an even number, just to show functionality)
    // Eventually, replace with real debt data field
    if (hasDebtFilter) {
      // Mocking debt condition for UI
      return parseInt(s.id, 16) % 2 === 0;
    }
    return true;
  });

  const { results: filteredSuppliers, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredSuppliers,
    ["name", "contactPerson", "city"],
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return formatDateToDDMMYYYY(dateString);
  };

  const getStatusBadge = (status: Supplier["status"]) => {
    return (
      <Badge
        variant={status === "active" ? "default" : "secondary"}
        className="text-xs"
      >
        {status === "active" ? "Active" : "Inactive"}
      </Badge>
    );
  };

  const getRatingStars = (rating: number) => {
    const safeRating = isNaN(rating) ? 0 : Math.min(5, Math.max(0, rating));
    return (
      "★".repeat(Math.floor(safeRating)) +
      "☆".repeat(5 - Math.floor(safeRating))
    );
  };

  const activeSuppliers = suppliers.filter((s) => s.status === "active").length;
  const totalSupplierValue = suppliers.reduce(
    (sum, supplier) => sum + supplier.totalValue,
    0,
  );

  const avgRating =
    suppliers.length > 0
      ? suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length
      : 0;

  // Mock debt data for the summary badge
  const debtSuppliersCount = suppliers.filter(
    (s) => parseInt(s.id, 16) % 2 === 0,
  ).length;
  const totalDebtAmount = 2610000;

  return (
    <div className="space-y-6 flex flex-col flex-1 min-h-0">
      <SupplierStats
        totalSuppliers={suppliers.length}
        activeSuppliers={activeSuppliers}
        totalValue={totalSupplierValue}
        avgRating={avgRating}
        ratingStars={getRatingStars(avgRating)}
        formatCurrency={formatCurrency}
      />

      <Card className="rounded-[14px] gap-0 border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col flex-1 overflow-hidden">
        <div className="px-[22px] py-[18px] border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-bold text-foreground">
              Vendor Directory
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Manage contacts and payables
            </p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {hasDebtFilter && (
              <span className="text-[13px] text-destructive font-semibold bg-destructive/10 px-3 py-1.5 rounded-full border border-destructive/20">
                {formatCurrency(totalDebtAmount)} owed to {debtSuppliersCount}{" "}
                suppliers
              </span>
            )}

            <button
              className={`px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer border transition-colors ${hasDebtFilter ? "bg-primary text-primary-foreground border-primary" : "bg-accent text-muted-foreground border-border hover:bg-accent/80"}`}
              onClick={() => setHasDebtFilter(!hasDebtFilter)}
            >
              Has debt
            </button>

            <div className="relative w-full md:w-[280px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search vendor name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-[13px] rounded-[10px] bg-muted border-border"
              />
            </div>

            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-colors flex items-center gap-2 h-9 w-full md:w-auto"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4" />
              New Vendor
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <SupplierTable
            suppliers={filteredSuppliers}
            totalCount={suppliers.length}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            getStatusBadge={getStatusBadge}
            getRatingStars={getRatingStars}
            isFuzzyFallback={isFuzzyFallback}
          />
        </div>
      </Card>

      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddSupplier={handleAddSupplier}
      />
    </div>
  );
}
