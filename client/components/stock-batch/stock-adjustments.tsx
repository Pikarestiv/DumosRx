"use client";

import { genericFuzzySearch } from "@/lib/utils/search";
import { AddStockAdjustmentForm } from "./add-stock-adjustment-form";
import { useStockAdjustments } from "@/lib/hooks/use-stock-adjustments";
import { StockAdjustmentLoading } from "./stock-adjustments/stock-adjustment-loading";
import { StockAdjustmentMetrics } from "./stock-adjustments/stock-adjustment-metrics";
import { StockAdjustmentFilters } from "./stock-adjustments/stock-adjustment-filters";
import { StockAdjustmentTable } from "./stock-adjustments/stock-adjustment-table";

export function StockAdjustments() {
  const {
    adjustments,
    loading,
    showAddForm,
    setShowAddForm,
    searchTerm,
    setSearchTerm,
    newAdjustment,
    setNewAdjustment,
    reasons,
    handleSubmitAdjustment,
    pendingAdjustments,
    totalAdjustments,
    thisMonthAdjustments,
  } = useStockAdjustments();

  if (loading) {
    return <StockAdjustmentLoading />;
  }

  const { results: filteredAdjustments, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    adjustments,
    ["product", "reason"],
  );

  return (
    <div className="space-y-6">
      <StockAdjustmentMetrics
        totalAdjustments={totalAdjustments}
        pendingAdjustments={pendingAdjustments}
        thisMonthAdjustments={thisMonthAdjustments}
      />

      {showAddForm && (
        <AddStockAdjustmentForm
          newAdjustment={newAdjustment}
          setNewAdjustment={setNewAdjustment}
          onSubmit={handleSubmitAdjustment}
          onCancel={() => setShowAddForm(false)}
          reasons={reasons}
        />
      )}

      <StockAdjustmentFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onNewAdjustment={() => setShowAddForm(true)}
      />

      <StockAdjustmentTable
        adjustments={adjustments}
        filteredAdjustments={filteredAdjustments}
        isFuzzyFallback={isFuzzyFallback}
      />
    </div>
  );
}
