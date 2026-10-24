"use client";

import type { ReactNode } from "react";
import type { SupplierViewModel } from "@/lib/types/supplier";

interface SupplierMobileListProps {
  suppliers: SupplierViewModel[];
  emptyState: ReactNode;
  formatCurrency: (amount: number) => string;
  getRatingStars: (rating: number) => string;
  selectedSupplierId?: string;
  onRowClick?: (supplier: SupplierViewModel) => void;
}

export function SupplierMobileList({
  suppliers,
  emptyState,
  formatCurrency,
  getRatingStars,
  selectedSupplierId,
  onRowClick,
}: SupplierMobileListProps) {
  return (
    <div className="flex flex-col gap-2 px-0 py-3">
      {suppliers.length === 0 && emptyState}
      {suppliers.map((supplier) => {
        const isSelected = selectedSupplierId === supplier.id;
        return (
          <div
            key={supplier.id}
            role="button"
            tabIndex={0}
            onClick={() => onRowClick?.(supplier)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick?.(supplier);
              }
            }}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${
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
                {supplier.contactPerson ||
                  supplier.email ||
                  supplier.phone ||
                  "No contact info"}
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
  );
}
