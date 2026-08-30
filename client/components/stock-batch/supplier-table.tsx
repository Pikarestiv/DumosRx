"use client";

import { useState } from "react";
import { Users, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { SupplierViewModel } from "@/lib/types/supplier";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { useUpdateSupplierRatingMutation } from "@/lib/hooks/use-supplier-mutations";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";

type SupplierSortKey = "name" | "contact" | "totalOrders" | "rating" | "totalValue";

interface SupplierTableProps {
  suppliers: SupplierViewModel[];
  formatCurrency: (amount: number) => string;
  getRatingStars: (rating: number) => string;
  isFuzzyFallback?: boolean;
  selectedSupplierId?: string;
  onRowClick?: (supplier: SupplierViewModel) => void;
  sortKey: SupplierSortKey | null;
  sortDirection: SortDirection;
  onToggleSort: (key: SupplierSortKey) => void;
  onSupplierUpdated: () => void;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground h-32">
      <Users className="h-8 w-8 mb-2 opacity-50" />
      <p className="font-medium">No suppliers found</p>
      <p className="text-sm">Try adjusting your search or add a new supplier</p>
    </div>
  );
}

export function SupplierTable({
  suppliers,
  formatCurrency,
  getRatingStars,
  isFuzzyFallback,
  selectedSupplierId,
  onRowClick,
  sortKey,
  sortDirection,
  onToggleSort,
  onSupplierUpdated,
}: SupplierTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState(0);
  const updateRatingMutation = useUpdateSupplierRatingMutation();

  const startQuickEdit = (supplier: SupplierViewModel) => {
    setEditingId(supplier.id);
    setDraftRating(supplier.rating);
  };

  const saveQuickEdit = (supplier: SupplierViewModel) => {
    if (updateRatingMutation.isPending) return;
    updateRatingMutation.mutate(
      { id: supplier.id, rating: Math.min(5, Math.max(0, draftRating)) },
      {
        onSuccess: () => {
          toast.success(`${supplier.name} updated`);
          onSupplierUpdated();
        },
        onError: () => {
          toast.error("Failed to update supplier. Please try again.");
        },
        onSettled: () => {
          setEditingId(null);
        },
      },
    );
  };

  return (
    <div className="w-full">
      {isFuzzyFallback && suppliers.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4 mx-0 md:mx-4 mt-4">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}

      {/* Mobile: card list */}
      <div className="md:hidden flex flex-col gap-2 px-0 py-3">
        {suppliers.length === 0 && <EmptyState />}
        {suppliers.map((supplier) => {
          const isSelected = selectedSupplierId === supplier.id;
          return (
            <div
              key={supplier.id}
              onClick={() => onRowClick?.(supplier)}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                isSelected
                  ? "bg-primary/10 border-primary/30"
                  : "bg-card border-border hover:bg-primary/5"
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                {supplier.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-foreground truncate">
                  {supplier.name}
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  {supplier.contactPerson || supplier.email || supplier.phone || "No contact info"}
                </div>
                {supplier.hasDebt && (
                  <div className="text-[11px] text-destructive font-medium mt-0.5">
                    Owed {formatCurrency(supplier.debtAmount)}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[13px] font-semibold text-foreground whitespace-nowrap">
                  {formatCurrency(supplier.totalValue)}
                </span>
                <span className="text-amber-500 text-[12px] tracking-widest">
                  {getRatingStars(supplier.rating)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: div-based table, with ARIA table roles standing in for real <table> semantics */}
      <div
        role="table"
        aria-label="Suppliers"
        className="hidden md:block overflow-x-auto"
      >
        <div role="rowgroup">
          <div
            role="row"
            className="grid grid-cols-[1.3fr_1fr_90px_90px_100px_28px] gap-2 px-4 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wide"
          >
            <SortableHeaderCell
              label="Supplier"
              active={sortKey === "name"}
              direction={sortDirection}
              onClick={() => onToggleSort("name")}
              className="h-11"
            />
            <SortableHeaderCell
              label="Contact"
              active={sortKey === "contact"}
              direction={sortDirection}
              onClick={() => onToggleSort("contact")}
              className="h-11"
            />
            <SortableHeaderCell
              label="Orders"
              active={sortKey === "totalOrders"}
              direction={sortDirection}
              onClick={() => onToggleSort("totalOrders")}
              className="h-11"
            />
            <SortableHeaderCell
              label="Rating"
              active={sortKey === "rating"}
              direction={sortDirection}
              onClick={() => onToggleSort("rating")}
              className="h-11"
            />
            <SortableHeaderCell
              label="Total Value"
              active={sortKey === "totalValue"}
              direction={sortDirection}
              onClick={() => onToggleSort("totalValue")}
              className="h-11"
            />
            <div />
          </div>
        </div>

        <div role="rowgroup">
          {suppliers.length === 0 && (
            <div role="row">
              <div role="cell" className="h-32 flex items-center justify-center">
                <EmptyState />
              </div>
            </div>
          )}
          {suppliers.map((supplier) => {
            const isSelected = selectedSupplierId === supplier.id;
            const isEditingRow = editingId === supplier.id;
            return (
              <div
                key={supplier.id}
                role="row"
                tabIndex={0}
                onClick={() => {
                  if (!isEditingRow) onRowClick?.(supplier);
                }}
                onKeyDown={(e) => {
                  if (!isEditingRow && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onRowClick?.(supplier);
                  }
                }}
                className={`group grid grid-cols-[1.3fr_1fr_90px_90px_100px_28px] gap-2 items-center px-4 py-[14px] border-b border-border/50 cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-primary/5"
                }`}
              >
                <div role="cell" className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                    {supplier.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-[13.5px] truncate">
                      {supplier.name}
                    </div>
                    {supplier.hasDebt && (
                      <div className="text-[11px] text-destructive font-medium mt-0.5">
                        Owed {formatCurrency(supplier.debtAmount)}
                      </div>
                    )}
                  </div>
                </div>
                <div role="cell">
                  <div className="text-muted-foreground truncate text-[12.5px]">
                    {supplier.contactPerson || supplier.email || supplier.phone}
                  </div>
                  <div className="text-muted-foreground truncate text-[11px] mt-0.5">
                    {supplier.address}
                  </div>
                </div>
                <div role="cell">
                  <div className="text-muted-foreground font-medium text-[13px]">
                    {supplier.totalOrders}
                  </div>
                </div>
                {isEditingRow ? (
                  <div role="cell" onClick={(e) => e.stopPropagation()}>
                    <EditableNumberCell
                      value={draftRating}
                      onCommit={setDraftRating}
                      parse={parseFloat}
                      step="0.5"
                      min={0}
                      widthClassName="w-16"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div role="cell">
                    <div className="flex text-amber-500 text-[13px] tracking-widest">
                      {getRatingStars(supplier.rating)}
                    </div>
                  </div>
                )}
                <div role="cell">
                  <div className="font-semibold text-foreground text-[13px]">
                    {formatCurrency(supplier.totalValue)}
                  </div>
                </div>
                {isEditingRow ? (
                  <div
                    role="cell"
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => saveQuickEdit(supplier)}
                      disabled={updateRatingMutation.isPending}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={updateRatingMutation.isPending}
                      className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div role="cell">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startQuickEdit(supplier);
                      }}
                      className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity"
                      title="Quick edit rating"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
