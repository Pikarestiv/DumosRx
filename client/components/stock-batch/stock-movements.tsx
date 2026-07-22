"use client";

import { useState, useEffect } from "react";
import { Search, Lock, X } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { genericFuzzySearch } from "@/lib/utils/search";
import { isTauri } from "@/lib/db/local-database";
import { StockMovementsSkeleton } from "./stock-movements-skeleton";
import { useRouter } from "next/navigation";

interface StockMovement {
  id: string;
  date: string;
  product: string;
  type: string;
  quantity: number;
  reason: string;
  reference: string;
  user: string;
  supplier?: string;
  batchNumber?: string;
}

const FILTER_TYPES = [
  { id: "all", label: "All types" },
  { id: "sale", label: "Sales" },
  { id: "purchase", label: "Restock" },
  { id: "return", label: "Returns" },
  { id: "damaged", label: "Damage" },
  { id: "adjustment", label: "Adjustments" },
];

export function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
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

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' });
  };
  
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return "Today";
    }
    return d.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return <StockMovementsSkeleton />;
  }

  return (
    <div className="relative">
      <div className="bg-card border border-border rounded-2xl flex flex-col flex-1 min-h-[600px]">
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
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {FILTER_TYPES.map((ft) => (
              <div
                key={ft.id}
                onClick={() => setTypeFilter(ft.id)}
                className={`px-3.5 py-1.5 rounded-full border text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  typeFilter === ft.id
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                }`}
              >
                {ft.label}
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Grid Header */}
        <div className="hidden md:grid grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide border-b border-border">
          <div>Time</div>
          <div>Product</div>
          <div>Type</div>
          <div>Qty</div>
          <div>Reference / Reason</div>
          <div>User</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredMovements.length === 0 && (
                              <div className="p-8 text-center text-muted-foreground text-[13px]">
                                No movements found.
                              </div>
                            )}
                  {!(filteredMovements.length === 0) && (
                              filteredMovements.map((movement) => {
                                const isPositive = movement.quantity > 0;
                                return (
                                  <div
                                    key={movement.id}
                                    onClick={() => setSelectedMovement(movement)}
                                    className="grid grid-cols-1 md:grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-3 items-center border-b border-border cursor-pointer hover:bg-accent/50 transition-colors"
                                  >
                                    <div className="text-[12px] text-muted-foreground">
                                      <span className="md:hidden font-semibold mr-1">{formatDate(movement.date)}</span>
                                      {formatTime(movement.date)}
                                    </div>
                                    <div className="text-[13px] font-semibold truncate">
                                      {movement.product}
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-semibold bg-muted/30 border border-border text-foreground px-2 py-0.5 rounded-md capitalize">
                                        {movement.type}
                                      </span>
                                    </div>
                                    <div
                                      className={`text-[14px] font-semibold ${
                                        isPositive ? "text-emerald-700" : "text-destructive"
                                      }`}
                                    >
                                      {!!(isPositive) && "+"}
                                            {!(isPositive) && ""}
                                      {movement.quantity}
                                    </div>
                                    <div className="text-[12px] text-muted-foreground truncate">
                                      {movement.reference || movement.reason || "-"}
                                    </div>
                                    <div className="text-[12px] text-foreground truncate">
                                      {movement.user}
                                    </div>
                                  </div>
                                );
                              })
                            )}
        </div>
      </div>

      {/* Detail Modal overlay */}
      {selectedMovement && (
        <div className="fixed inset-0 bg-[rgba(16,24,40,0.42)] z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] bg-card rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(16,24,40,0.14)] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="text-[15px] font-semibold">Movement detail</div>
              <div
                className="w-[30px] h-[30px] rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent transition-colors"
                onClick={() => setSelectedMovement(null)}
              >
                <X className="w-4 h-4" />
              </div>
            </div>
            <div className="px-5 py-[18px]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[15px] font-semibold">
                    {selectedMovement.product}
                  </div>
                  <div className="text-[12px] text-muted-foreground/70">
                    {formatDate(selectedMovement.date)}, {formatTime(selectedMovement.date)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-semibold bg-muted/30 border border-border text-foreground px-2 py-0.5 rounded-md capitalize inline-block">
                    {selectedMovement.type}
                  </span>
                  <div
                    className={`text-[18px] font-semibold mt-1 ${
                      selectedMovement.quantity > 0
                        ? "text-emerald-700"
                        : "text-destructive"
                    }`}
                  >
                    {selectedMovement.quantity > 0 && "+"}
                                      {!(selectedMovement.quantity > 0) && ""}
                    {selectedMovement.quantity}
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3.5 flex flex-col gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                    Reference / reason
                  </div>
                  <div className="text-[13px] text-foreground">
                    {selectedMovement.reference || selectedMovement.reason || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                    Recorded by
                  </div>
                  <div className="text-[13px] text-foreground">{selectedMovement.user}</div>
                </div>
              </div>
              <div 
                className="text-[12px] font-semibold text-primary mt-5 cursor-pointer hover:underline"
                onClick={() => {
                  setSelectedMovement(null);
                  router.push('/inventory/catalog')
                }}
              >
                View product in Catalog →
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
