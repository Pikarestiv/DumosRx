"use client";

import { useRefillManagement } from "./refill-management/use-refill-management";
import { RefillSummaryCards } from "./refill-management/refill-summary-cards";
import { RefillFilters } from "./refill-management/refill-filters";
import { RefillTable } from "./refill-management/refill-table";

export function RefillManagement() {
  const {
    refills,
    filteredRefills,
    isFuzzyFallback,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    formatCurrency,
    formatDate,
    processRefill,
    dueCount,
    overdueCount,
    earlyCount,
    completedCount,
  } = useRefillManagement();

  return (
    <div className="space-y-6">
      <RefillSummaryCards
        dueCount={dueCount}
        overdueCount={overdueCount}
        earlyCount={earlyCount}
        completedCount={completedCount}
      />

      <RefillFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      <RefillTable
        filteredRefills={filteredRefills}
        totalCount={refills.length}
        isFuzzyFallback={isFuzzyFallback}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        processRefill={processRefill}
      />
    </div>
  );
}
