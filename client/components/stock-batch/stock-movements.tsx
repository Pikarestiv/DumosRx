"use client";

import { useState, useEffect } from "react";
import { Search, Lock, X, DollarSign, RefreshCw, AlertTriangle, Shield, Undo2 } from "lucide-react";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { genericFuzzySearch } from "@/lib/utils/search";
import { StockMovementsSkeleton } from "./stock-movements-skeleton";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

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


const getTypeColor = (type: string) => {
  switch (type.toLowerCase()) {
    case 'adjustment': return 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30';
    case 'purchase':
    case 'restock': return 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30';
    case 'return': return 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30';
    case 'damaged':
    case 'damage': return 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30';
    case 'sale': return 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30';
    default: return 'bg-muted/30 border border-border text-foreground';
  }
}

const getTypeIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'adjustment': return <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'purchase':
    case 'restock': return <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'return': return <Undo2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case 'damaged':
    case 'damage': return <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case 'sale': return <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />;
    default: return <Search className="w-4 h-4 text-muted-foreground" />;
  }
}

const getTypeIconBg = (type: string) => {
  switch (type.toLowerCase()) {
    case 'adjustment': return 'bg-amber-50 dark:bg-amber-500/10';
    case 'purchase':
    case 'restock': return 'bg-blue-50 dark:bg-blue-500/10';
    case 'return': return 'bg-purple-50 dark:bg-purple-500/10';
    case 'damaged':
    case 'damage': return 'bg-red-50 dark:bg-red-500/10';
    case 'sale': return 'bg-emerald-50 dark:bg-emerald-500/10';
    default: return 'bg-muted/30';
  }
}

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

  const groupedMovements = filteredMovements.reduce((acc, movement) => {
    const date = new Date(movement.date);
    let groupLabel = format(date, "MMM d, yyyy").toUpperCase();
    
    if (isToday(date)) groupLabel = 'TODAY';
    else if (isYesterday(date)) groupLabel = 'YESTERDAY';
    else {
      const diff = differenceInDays(new Date(), date);
      if (diff > 1 && diff <= 7) groupLabel = `${diff} DAYS AGO`;
    }
    
    if (!acc[groupLabel]) acc[groupLabel] = [];
    acc[groupLabel].push(movement);
    return acc;
  }, {} as Record<string, StockMovement[]>);

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
          <Tabs
            value={typeFilter}
            onValueChange={setTypeFilter as any}
            variant="chips"
          >
            <TabsList>
              {FILTER_TYPES.map((ft) => (
                <TabsTrigger key={ft.id} value={ft.id}>
                  {ft.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
        <div className="flex-1 overflow-y-auto pb-6">
          {filteredMovements.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-[13px]">
              No movements found.
            </div>
          )}
          {filteredMovements.length > 0 && (
            <>
              {/* Desktop View */}
              <div className="hidden md:block">
                {filteredMovements.map((movement) => {
                  const isPositive = movement.quantity > 0;
                  return (
                    <div
                      key={movement.id}
                      onClick={() => setSelectedMovement(movement)}
                      className="grid grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-3 items-center border-b border-border cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <div className="text-[12px] text-muted-foreground">
                        {formatTime(movement.date)}
                      </div>
                      <div className="text-[13px] font-semibold truncate">
                        {movement.product}
                      </div>
                      <div>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${getTypeColor(movement.type)}`}>
                          {movement.type}
                        </span>
                      </div>
                      <div
                        className={`text-[14px] font-semibold ${
                          isPositive ? "text-emerald-700" : "text-destructive"
                        }`}
                      >
                        {isPositive ? "+" : ""}{movement.quantity}
                      </div>
                      <div className="text-[12px] text-muted-foreground truncate">
                        {movement.reference || movement.reason || "-"}
                      </div>
                      <div className="text-[12px] text-foreground truncate">
                        {movement.user}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mobile View */}
              <div className="md:hidden mt-4">
                {Object.entries(groupedMovements).map(([groupLabel, groupItems]) => (
                  <div key={groupLabel} className="mb-6">
                    <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide px-4 mb-2">
                      {groupLabel}
                    </div>
                    <div className="bg-card border border-border rounded-[14px] mx-4 shadow-sm overflow-hidden">
                      {groupItems.map((movement, i) => {
                        const isPositive = movement.quantity > 0;
                        const Icon = getTypeIcon(movement.type);
                        const iconBg = getTypeIconBg(movement.type);
                        const isLast = i === groupItems.length - 1;
                        
                        let displayReason = movement.reason || movement.reference || "-";
                        if (movement.type.toLowerCase() === 'sale') displayReason = `Sale ${movement.reference}`;
                        else if (movement.type.toLowerCase() === 'purchase' || movement.type.toLowerCase() === 'restock') displayReason = `PO-${movement.reference}`;

                        const signColor = 
                          movement.type.toLowerCase() === 'sale' ? 'text-foreground' : 
                          isPositive ? 'text-emerald-600' : 'text-destructive';

                        return (
                          <div
                            key={movement.id}
                            onClick={() => setSelectedMovement(movement)}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors ${!isLast ? 'border-b border-border/40' : ''}`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                              {Icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-semibold text-foreground truncate">
                                {movement.product}
                              </div>
                              <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                                {displayReason} · {movement.user.split(' ')[0]}
                              </div>
                            </div>
                            <div className={`text-[15px] font-bold shrink-0 ${signColor}`}>
                              {isPositive ? "+" : ""}{movement.quantity}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Detail Modal */}
      <ResponsiveModal
        open={!!selectedMovement}
        onOpenChange={(open) => {
          if (!open) setSelectedMovement(null);
        }}
        title="Movement detail"
        className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
        headerClassName="px-5 py-4 border-b border-border m-0"
      >
        {selectedMovement && (
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
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block ${getTypeColor(selectedMovement.type)}`}>
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
        )}
      </ResponsiveModal>
    </div>
  );
}
