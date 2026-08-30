"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";

import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { getSuppliers } from "@/lib/db/local-database";
import { useCreateSupplierMutation, useUpdateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useStore } from "@/lib/context/store-context";
import { SupplierDetailPane } from "./supplier-detail-pane";
import { SupplierTable } from "./supplier-table";
import { SupplierStatusFilter } from "./supplier-status-filter";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import type { SupplierViewModel, SupplierDbRow, SupplierPayload } from "@/lib/types/supplier";

const transformSupplier = (apiData: SupplierDbRow): SupplierViewModel => ({
  id: apiData.id,
  name: apiData.name,
  contactPerson: apiData.contact_person || "",
  email: apiData.email || "",
  phone: apiData.phone || "",
  address: apiData.address || "",
  taxId: apiData.tax_id || "",
  status: apiData.is_active ? "active" : "inactive",
  totalOrders: apiData.total_orders || 0,
  totalValue: apiData.total_value || 0,
  lastOrderDate: apiData.last_order_date || "",
  paymentTerms: String(apiData.payment_terms || "30 days"),
  rating: isNaN(Number(apiData.rating)) ? 5.0 : Number(apiData.rating),
  hasDebt: (apiData.total_debt || 0) > 0,
  debtAmount: apiData.total_debt || 0,
});

export function SupplierManagement() {
  const { t: _t } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: suppliers = [], refetch: fetchSuppliers } = useQuery({
    ...queryKeys.suppliers.all(),
    queryFn: async () => {
      const { data } = await getSuppliers();
      return data.map(transformSupplier);
    },
  });

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setShowAddDialog(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("action");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [searchParams, router, pathname]);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null,
  );

  const selectedSupplier =
    suppliers.find((s) => s.id === selectedSupplierId) || null;

  usePullToRefreshHandler(async () => {
    await fetchSuppliers();
  });

  const createSupplierMutation = useCreateSupplierMutation();

  const handleAddSupplier = (payload: SupplierPayload) => {
    // insert()'s global cache invalidation refreshes the `suppliers`
    // query automatically, no need to hand-splice the new row into
    // local state.
    createSupplierMutation.mutate(payload, {
      onSuccess: (newId) => {
        setSelectedSupplierId(newId);
        setShowAddDialog(false);
      },
      onError: (error) => {
        console.error("Failed to create supplier:", error);
      },
    });
  };

  const preFilteredSuppliers = suppliers.filter((s) => {
    if (filter === "debt") {
      return s.hasDebt;
    }
    return true;
  });

  const { results: searchedSuppliers, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredSuppliers,
    ["name", "contactPerson"],
  );

  const { sortKey, direction, toggleSort, sortedData: filteredSuppliers } =
    useSortableData(searchedSuppliers, {
      name: (s: SupplierViewModel) => s.name.toLowerCase(),
      contact: (s: SupplierViewModel) =>
        (s.contactPerson || s.email || s.phone || "").toLowerCase(),
      totalOrders: (s: SupplierViewModel) => s.totalOrders,
      rating: (s: SupplierViewModel) => s.rating,
      totalValue: (s: SupplierViewModel) => s.totalValue,
    });

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

  const getRatingStars = (rating: number) => {
    const safeRating = isNaN(rating) ? 0 : Math.min(5, Math.max(0, rating));
    return (
      "★".repeat(Math.floor(safeRating)) +
      "☆".repeat(5 - Math.floor(safeRating))
    );
  };

  // Use real debt data for the summary badge
  const debtSuppliersCount = suppliers.filter((s) => s.hasDebt).length;
  const totalDebtAmount = suppliers.reduce((sum, s) => sum + s.debtAmount, 0);

  const updateSupplierMutation = useUpdateSupplierMutation();

  const handleEditSupplier = (payload: SupplierPayload) => {
    if (!selectedSupplierId) return;
    updateSupplierMutation.mutate(
      { id: selectedSupplierId, payload },
      {
        onSuccess: () => {
          toast.success("Supplier details updated successfully!");
          setIsEditDialogOpen(false);
        },
        onError: (error) => {
          console.error("Failed to update supplier:", error);
          toast.error("Failed to update supplier");
        },
      },
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col gap-5 flex-1 min-h-0">
        {/* Supplier Directory */}
        <div className="border-0 md:border md:border-border bg-transparent md:bg-card rounded-none md:rounded-2xl shadow-none md:shadow-sm flex flex-col min-h-0 flex-1">
          <div className="p-0 md:p-4 md:pb-3 border-b-0 md:border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14.5px] font-semibold text-foreground">
                Supplier Directory
              </div>
              {/* <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-2 rounded-lg text-[12.5px] font-semibold h-auto"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Supplier
              </Button> */}
            </div>
            <div className="flex items-center mb-3">
              <div className="flex-1 flex items-center gap-2 bg-card md:bg-muted border border-border rounded-[10px] px-3.5 py-2.5">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Search suppliers, contacts, locations"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 outline-none text-[13px] w-full bg-card md:bg-muted h-auto p-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <SupplierStatusFilter filter={filter} setFilter={setFilter} />
              <div className="text-[11.5px] text-destructive font-medium">
                {formatCurrency(totalDebtAmount)} owed to {debtSuppliersCount}{" "}
                {debtSuppliersCount === 1 ? "supplier" : "suppliers"}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <SupplierTable
              suppliers={filteredSuppliers}
              formatCurrency={formatCurrency}
              getRatingStars={getRatingStars}
              isFuzzyFallback={isFuzzyFallback}
              selectedSupplierId={selectedSupplier?.id}
              onRowClick={(supplier) => setSelectedSupplierId(supplier.id)}
              sortKey={sortKey}
              sortDirection={direction}
              onToggleSort={toggleSort}
              onSupplierUpdated={fetchSuppliers}
            />
          </div>
        </div>
      </div>

      <ResponsiveDetailPanel
        open={!!selectedSupplier}
        onOpenChange={(open) => {
          if (!open) setSelectedSupplierId(null);
        }}
      >
        {selectedSupplier && (
          <SupplierDetailPane
            selectedSupplier={selectedSupplier}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            getRatingStars={getRatingStars}
            setIsEditDialogOpen={setIsEditDialogOpen}
            onBack={() => setSelectedSupplierId(null)}
          />
        )}
      </ResponsiveDetailPanel>

      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddSupplier={handleAddSupplier}
        isSubmitting={createSupplierMutation.isPending}
      />
      {selectedSupplier && (
        <AddSupplierDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onAddSupplier={handleEditSupplier}
          initialSupplier={selectedSupplier}
          isSubmitting={updateSupplierMutation.isPending}
        />
      )}
    </div>
  );
}
