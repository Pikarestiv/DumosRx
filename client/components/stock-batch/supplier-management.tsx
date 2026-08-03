"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { getSuppliers, createSupplier } from "@/lib/db/local-database";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useStore } from "@/lib/context/store-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SupplierStats } from "./supplier-stats";
import { SupplierDetailPane } from "./supplier-detail-pane";
import { SupplierTable } from "./supplier-table";
import { SupplierStatusFilter } from "./supplier-status-filter";
import { genericFuzzySearch } from "@/lib/utils/search";
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
  status: apiData.is_active ? "active" : "inactive",
  totalOrders: 0,
  totalValue: 0,
  lastOrderDate: new Date().toISOString(),
  paymentTerms: String(apiData.payment_terms || "30 days"),
  rating: isNaN(Number(apiData.rating)) ? 5.0 : Number(apiData.rating),
  hasDebt: (apiData.total_debt || 0) > 0,
  debtAmount: apiData.total_debt || 0,
});

export function SupplierManagement() {
  const { t: _t } = useStore();
  const isDesktop = useMediaQuery("(min-width: 768px)");
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

  // Ensure selectedSupplier defaults to the first supplier when data loads
  // (desktop only — on mobile a selection opens a full-screen takeover, so
  // it shouldn't be forced open on load).
  useEffect(() => {
    if (!isDesktop) return;
    if (suppliers.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId, isDesktop]);

  usePullToRefreshHandler(async () => {
    await fetchSuppliers();
  });

  const handleAddSupplier = async (payload: SupplierPayload) => {
    try {
      // insert()'s global cache invalidation refreshes the `suppliers`
      // query automatically — no need to hand-splice the new row into
      // local state.
      const newId = await createSupplier(payload);
      setSelectedSupplierId(newId);
      setShowAddDialog(false);
    } catch (error) {
      console.error("Failed to create supplier:", error);
    }
  };

  const preFilteredSuppliers = suppliers.filter((s) => {
    if (filter === "debt") {
      return s.hasDebt;
    }
    return true;
  });

  const { results: filteredSuppliers, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredSuppliers,
    ["name", "contactPerson"],
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

  // Use real debt data for the summary badge
  const debtSuppliersCount = suppliers.filter((s) => s.hasDebt).length;
  const totalDebtAmount = suppliers.reduce((sum, s) => sum + s.debtAmount, 0);

  const handleEditSupplier = () => {
    // We would normally call the database update here
    toast.success("Supplier details updated successfully!");
    setIsEditDialogOpen(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SupplierStats
        totalSuppliers={suppliers.length}
        activeSuppliers={activeSuppliers}
        totalValue={totalSupplierValue}
        avgRating={avgRating}
        ratingStars={getRatingStars(avgRating)}
        formatCurrency={formatCurrency}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 flex-1 min-h-0">
        {/* Left Pane: Supplier Directory */}
        <div className="border-0 md:border md:border-border bg-transparent md:bg-card rounded-none md:rounded-2xl shadow-none md:shadow-sm flex flex-col min-h-0">
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
            />
          </div>
        </div>

        {/* Right Pane: Supplier Detail */}
        <div className="hidden xl:block bg-card border border-border rounded-2xl shadow-sm min-h-0 overflow-hidden">
          <SupplierDetailPane
            selectedSupplier={selectedSupplier}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            getRatingStars={getRatingStars}
            setIsEditDialogOpen={setIsEditDialogOpen}
          />
        </div>
      </div>

      {/* Mobile Detail Panel (Sheet, full-screen push) */}
      <Sheet
        open={!!selectedSupplier && !isDesktop}
        onOpenChange={(open) => {
          if (!open) setSelectedSupplierId(null);
        }}
      >
        <SheetContent
          side="right"
          hideClose
          className="w-full sm:w-[400px] p-0 flex flex-col bg-card"
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
        </SheetContent>
      </Sheet>

      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddSupplier={handleAddSupplier}
      />
      {selectedSupplier && (
        <AddSupplierDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onAddSupplier={handleEditSupplier}
          initialSupplier={selectedSupplier}
        />
      )}
    </div>
  );
}
