"use client";

import { useState, useEffect } from "react";
import { Search, Lock } from "lucide-react";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { genericFuzzySearch } from "@/lib/utils/search";
import { StockMovementsSkeleton } from "./stock-movements-skeleton";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockMovement, FILTER_TYPES } from "./stock-movement-utils";
import { StockMovementDesktopRow } from "./stock-movement-desktop-row";
import { StockMovementMobileGroup } from "./stock-movement-mobile-group";
import { StockMovementDetailModal } from "./stock-movement-detail-modal";

export function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedMovement, setSelectedMovement] =
    useState<StockMovement | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchMovements() {
      setLoading(true);
      try {
        const { getStockMovements } = await import("@/lib/db/local-database");
        const res = await getStockMovements(1, 100);

        const items = (res.data || []).map((m: any) => ({
          id: m.id,
          date: m.created_at || m.date || m.movement_date,
          product: m.product?.name || m.product_name || "Unknown",
          type: m.type || m.movement_type || "adjustment",
          quantity: m.quantity || 0,
          reason: m.reason || "",
          reference: m.reference || m.reference_id || "",
          user: m.user?.name || m.user_name || "System",
          supplier: m.supplier?.name || m.supplier_name,
          batchNumber: m.batch_number,
        }));
        setMovements(items);
      } catch (error) {
        console.error("Failed to fetch stock movements:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMovements();
  }, []);

  const preFilteredMovements = movements.filter((movement) => {
    return typeFilter === "all" || movement.type === typeFilter;
  });

  const { results: filteredMovements } = genericFuzzySearch(
    searchTerm,
    preFilteredMovements,
    ["product", "reference", "reason", "user"],
  );

  const groupedMovements = filteredMovements.reduce(
    (acc, movement) => {
      const date = new Date(movement.date);
      let groupLabel = format(date, "MMM d, yyyy").toUpperCase();

      if (isToday(date)) groupLabel = "TODAY";
      else if (isYesterday(date)) groupLabel = "YESTERDAY";
      else {
        const diff = differenceInDays(new Date(), date);
        if (diff > 1 && diff <= 7) groupLabel = `${diff} DAYS AGO`;
      }

      if (!acc[groupLabel]) acc[groupLabel] = [];
      acc[groupLabel].push(movement);
      return acc;
    },
    {} as Record<string, StockMovement[]>,
  );

  if (loading) {
    return <StockMovementsSkeleton />;
  }

  const renderTypeChips = (triggerClass = "") => (
    <Tabs
      value={typeFilter}
      onValueChange={setTypeFilter as any}
      variant="chips"
    >
      <TabsList>
        {FILTER_TYPES.map((ft) => (
          <TabsTrigger key={ft.id} value={ft.id} className={triggerClass}>
            {ft.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <div className="relative">
      {/* Mobile: search + chips stand alone above the list; no outer card, immutable-log note hidden */}
      <div className="md:hidden space-y-3 mb-4">
        <div className="flex items-center gap-2 bg-card border border-border rounded-[10px] px-3.5 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          <input
            type="text"
            placeholder="Search by product, reference, or user"
            className="border-0 outline-none text-[13px] w-full bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {renderTypeChips(
          "data-[state=inactive]:bg-card data-[state=inactive]:border-border",
        )}
      </div>

      <div className="hidden md:flex bg-card border border-border rounded-2xl flex-col flex-1 min-h-[600px]">
        {/* Header & Filters */}
        <div className="p-4 pb-3 border-b border-border">
          <div className="flex flex-col md:flex-row md:items-center gap-2.5 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border rounded-[10px] px-3.5 py-2.5">
              <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
              <input
                type="text"
                placeholder="Search by product, reference, or user"
                className="border-0 outline-none text-[13px] w-full bg-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/70 bg-muted/30 border border-border rounded-[10px] px-3 py-2.5 whitespace-nowrap w-max">
              <Lock className="w-3.5 h-3.5" />
              Immutable log — entries can't be edited
            </div>
          </div>
          {renderTypeChips(
            "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:text-primary",
          )}
        </div>

        {/* Desktop Grid Header */}
        <div className="grid grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide border-b border-border">
          <div>Time</div>
          <div>Product</div>
          <div>Type</div>
          <div>Qty</div>
          <div>Reference / Reason</div>
          <div>User</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-6">
          {filteredMovements.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-[13px]">
              No movements found.
            </div>
          )}
          {filteredMovements.length > 0 &&
            filteredMovements.map((movement) => (
              <StockMovementDesktopRow
                key={movement.id}
                movement={movement}
                onSelect={() => setSelectedMovement(movement)}
              />
            ))}
        </div>
      </div>

      {/* Mobile: grouped list, each group already renders its own card */}
      <div className="md:hidden">
        {filteredMovements.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-[13px]">
            No movements found.
          </div>
        )}
        {filteredMovements.length > 0 &&
          Object.entries(groupedMovements).map(([groupLabel, groupItems]) => (
            <StockMovementMobileGroup
              key={groupLabel}
              groupLabel={groupLabel}
              movements={groupItems}
              onSelect={setSelectedMovement}
            />
          ))}
      </div>

      <StockMovementDetailModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
        onViewInCatalog={() => {
          setSelectedMovement(null);
          router.push("/inventory/catalog");
        }}
      />
    </div>
  );
}
