"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Mail, Phone, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { getSuppliers, createSupplier } from "@/lib/db/local-database";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useStore } from "@/lib/context/store-context";
import { SupplierStats } from "./supplier-stats";
import { SupplierTable } from "./supplier-table";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string;
  paymentTerms: string;
  rating: number;
  hasDebt: boolean;
  debtAmount: number;
}

const transformSupplier = (apiData: any): Supplier => ({
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
  paymentTerms: apiData.payment_terms || "30 days",
  rating: isNaN(Number(apiData.rating)) ? 5.0 : Number(apiData.rating),
  hasDebt: (apiData.total_debt || 0) > 0,
  debtAmount: apiData.total_debt || 0,
});

export function SupplierManagement() {
  const { t } = useStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Ensure selectedSupplier defaults to the first supplier when data loads
  useEffect(() => {
    if (suppliers.length > 0 && !selectedSupplier) {
      setSelectedSupplier(suppliers[0]);
    }
  }, [suppliers, selectedSupplier]);

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
      setSelectedSupplier(newSupplier);
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

  const renderDetailPane = () => {
    if (!selectedSupplier) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full min-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="w-6 h-6 opacity-50" />
          </div>
          <p className="font-medium text-foreground">No Supplier Selected</p>
          <p className="text-sm mt-1">
            Select a supplier from the directory to view details
          </p>
        </div>
      );
    }

    const hasDebt = selectedSupplier.hasDebt;

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[18px] font-bold shrink-0">
                {selectedSupplier.name[0]}
              </div>
              <div>
                <h2 className="text-[18px] font-bold leading-tight text-foreground">
                  {selectedSupplier.name}
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {selectedSupplier.contactPerson}
                </p>
              </div>
            </div>
            <Badge
              variant={
                selectedSupplier.status === "active" ? "default" : "secondary"
              }
              className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-0"
            >
              {selectedSupplier.status === "active" ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 mt-4">
            <div className="flex text-amber-500 text-[13px] tracking-widest">
              {getRatingStars(selectedSupplier.rating)}
            </div>
            <span className="text-[13px] font-medium text-muted-foreground">
              {selectedSupplier.rating.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="p-6 flex-1">
          {hasDebt && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-destructive uppercase tracking-wide">
                    Outstanding Debt
                  </div>
                  <div className="text-[12px] text-destructive/80 mt-0.5">
                    From unpaid purchase orders
                  </div>
                </div>
                <div className="text-[15px] font-bold text-destructive">
                  {formatCurrency(selectedSupplier.debtAmount)}
                </div>
              </div>
              <Button className="w-full bg-[#2054E0] hover:bg-[#2054E0]/90 text-white font-semibold">
                Record Payment
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                Email
              </div>
              <div className="text-[13.5px] font-medium text-foreground">
                {selectedSupplier.email || "N/A"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                Phone
              </div>
              <div className="text-[13.5px] font-medium text-foreground">
                {selectedSupplier.phone || "N/A"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                Total Orders
              </div>
              <div className="text-[13.5px] font-medium text-foreground font-semibold">
                {selectedSupplier.totalOrders}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                Total Value
              </div>
              <div className="text-[13.5px] font-medium text-foreground font-semibold">
                {formatCurrency(selectedSupplier.totalValue)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                Last Order
              </div>
              <div className="text-[13.5px] font-medium text-foreground font-semibold">
                {formatDate(selectedSupplier.lastOrderDate)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border mt-auto grid grid-cols-2 gap-3 shrink-0">
          <Button
            variant="outline"
            className="w-full font-semibold border-border"
          >
            Edit Details
          </Button>
          <Button className="w-full font-semibold">New Order</Button>
        </div>
      </div>
    );
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
        <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col min-h-0">
          <div className="p-4 pb-3 border-b border-border">
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
              <div className="flex-1 flex items-center gap-2 bg-muted border border-border rounded-[10px] px-3.5 py-2.5">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Search suppliers, contacts, locations"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 outline-none text-[13px] w-full bg-transparent h-auto p-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Tabs variant="chips" value={filter} onValueChange={setFilter}>
                <TabsList className="w-full md:w-max justify-start overflow-x-auto hide-scrollbar">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="debt">Has debt</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="text-[11.5px] text-destructive font-medium">
                {formatCurrency(totalDebtAmount)} owed to {debtSuppliersCount}{" "}
                suppliers
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <SupplierTable
              suppliers={filteredSuppliers}
              totalCount={suppliers.length}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              getRatingStars={getRatingStars}
              isFuzzyFallback={isFuzzyFallback}
              selectedSupplierId={selectedSupplier?.id}
              onRowClick={setSelectedSupplier}
            />
          </div>
        </div>

        {/* Right Pane: Supplier Detail */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hidden xl:flex flex-col min-h-0">
          {renderDetailPane()}
        </div>
      </div>

      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddSupplier={handleAddSupplier}
      />
    </div>
  );
}
