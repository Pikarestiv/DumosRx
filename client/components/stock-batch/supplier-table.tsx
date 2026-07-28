"use client";

import { Users } from "lucide-react";

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

interface SupplierTableProps {
  suppliers: Supplier[];
  formatCurrency: (amount: number) => string;
  getRatingStars: (rating: number) => string;
  isFuzzyFallback?: boolean;
  selectedSupplierId?: string;
  onRowClick?: (supplier: Supplier) => void;
}

const COLUMNS = [
  { label: "Supplier", className: "w-[1.3fr]" },
  { label: "Contact", className: "w-[1fr]" },
  { label: "Orders", className: "w-[90px]" },
  { label: "Rating", className: "w-[90px]" },
  { label: "Total Value", className: "w-[100px]" },
];

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
}: SupplierTableProps) {
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
            className="grid grid-cols-[1.3fr_1fr_90px_90px_100px] gap-2 px-4 border-b border-border"
          >
            {COLUMNS.map((col) => (
              <div
                key={col.label}
                role="columnheader"
                className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 flex items-center"
              >
                {col.label}
              </div>
            ))}
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
            return (
              <div
                key={supplier.id}
                role="row"
                tabIndex={0}
                onClick={() => onRowClick?.(supplier)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick?.(supplier);
                  }
                }}
                className={`grid grid-cols-[1.3fr_1fr_90px_90px_100px] gap-2 items-center px-4 py-[14px] border-b border-border/50 cursor-pointer transition-colors group ${
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
                <div role="cell">
                  <div className="flex text-amber-500 text-[13px] tracking-widest">
                    {getRatingStars(supplier.rating)}
                  </div>
                </div>
                <div role="cell">
                  <div className="font-semibold text-foreground text-[13px]">
                    {formatCurrency(supplier.totalValue)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
