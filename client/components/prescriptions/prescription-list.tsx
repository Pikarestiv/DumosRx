"use client";

import { useRef } from "react";
import { Prescription } from "@/lib/hooks/use-prescription-queue";
import { AlertTriangle } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card } from "@/components/ui/card";
import {
  PRESCRIPTION_STATUS_META,
  getInitials,
} from "./prescription-status-meta";
import { PrescriptionSearchBar } from "./prescription-search-bar";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface PrescriptionListProps {
  prescriptions: Prescription[];
  selectedPrescription: Prescription | null;
  onSelect: (prescription: Prescription) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  isFuzzyFallback?: boolean;
}

export function PrescriptionList({
  prescriptions,
  selectedPrescription,
  onSelect,
  searchTerm,
  setSearchTerm,

  isFuzzyFallback,
}: PrescriptionListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: prescriptions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 8,
    // Card padding/border differs between mobile and lg:, so measure actual
    // rendered height per row instead of assuming one fixed size.
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <Card className="bg-transparent border-0 shadow-none rounded-none lg:bg-card lg:border lg:border-border lg:rounded-2xl lg:shadow-sm flex flex-col min-h-0 lg:h-full p-0 gap-0">
      {/* Search: renders standalone above on mobile (see PrescriptionManagement) */}
      <div className="hidden lg:block p-4 pb-3 border-b border-border">
        <PrescriptionSearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      </div>

      {isFuzzyFallback && prescriptions.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-xs border-b border-amber-500/20 text-center font-medium">
          Did you mean? (No exact matches found)
        </div>
      )}

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-0 lg:p-3">
        {prescriptions.length === 0 && (
          <div className="text-center text-[12.5px] text-muted-foreground py-10">
            No prescriptions match.
          </div>
        )}
        {prescriptions.length > 0 && (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rx = prescriptions[virtualRow.index];
            const isSelected = selectedPrescription?.id === rx.id;
            const meta = PRESCRIPTION_STATUS_META[rx.status];
            const isUrgent = rx.priority === "urgent" || rx.priority === "stat";
            const firstMed = rx.medications[0];

            return (
              <div
                key={rx.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full pb-2 lg:pb-1"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
              <div
                onClick={() => onSelect(rx)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card lg:border-transparent lg:bg-transparent hover:bg-muted/50"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                  {getInitials(rx.patientName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[13px] font-semibold truncate">
                      {rx.patientName}
                    </div>
                    {isUrgent && (
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {firstMed
                      ? `${firstMed.productName}${firstMed.strength ? ` ${firstMed.strength}` : ""} · `
                      : ""}
                    {formatDateToDDMMYYYY(rx.dateIssued)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                  {!!rx.hasRefillDue && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-primary/10 text-primary">
                      Refill due
                    </span>
                  )}
                </div>
              </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
