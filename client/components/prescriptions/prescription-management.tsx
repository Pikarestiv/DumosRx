"use client";
import { usePrescriptionManagement } from "@/lib/hooks/use-prescription-management";
import { PrescriptionList } from "./prescription-list";
import { PrescriptionSearchBar } from "./prescription-search-bar";
import { PrescriptionDetailPanel } from "./prescription-detail-panel";
import { PriorityBadge } from "./priority-badge";
import { NewPrescription } from "./new-prescription";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { ArrowLeft } from "lucide-react";
import { PrescriptionStatusFilter } from "./prescription-status-filter";

const STATUS_FILTERS = [
  { value: "all", label: "All", short: "All" },
  { value: "pending", label: "Needs verification", short: "Needs Rx" },
  { value: "refill_due", label: "Refills due", short: "Refills" },
  { value: "ready", label: "Ready for pickup", short: "Ready" },
  { value: "completed", label: "History", short: "History" },
];

export function PrescriptionManagement() {
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    filteredPrescriptions,
    selectedPrescription,
    setSelectedPrescription,
    updatePrescriptionStatus,
    updatingStatusId,
    isFuzzyFallback,
    showNewPrescription,
    closeNewPrescription,
    formatDateTime,
    handleEdit,
    handleDispense,
    handleDispenseRefill,
    handleProcessReturn,
    processingReturnRxId,
  } = usePrescriptionManagement();

  return (
    <div className="flex flex-col lg:flex-1 lg:min-h-0 gap-4 lg:gap-6">
      {/* Mobile: search bar stands alone above the filter chips, own bg-card to contrast with the page */}
      <div className="lg:hidden">
        <PrescriptionSearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          className="bg-card border-border"
        />
      </div>

      <PrescriptionStatusFilter
        filters={STATUS_FILTERS}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      <PrescriptionList
        prescriptions={filteredPrescriptions}
        selectedPrescription={selectedPrescription}
        onSelect={setSelectedPrescription}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isFuzzyFallback={isFuzzyFallback}
      />

      <ResponsiveDetailPanel
        open={!!selectedPrescription}
        onOpenChange={(open) => {
          if (!open) setSelectedPrescription(null);
        }}
      >
        {selectedPrescription && (
          <PrescriptionDetailPanel
            prescription={selectedPrescription}
            getPriorityBadge={(priority) => <PriorityBadge priority={priority} />}
            formatDateTime={formatDateTime}
            onClose={() => setSelectedPrescription(null)}
            onEdit={handleEdit}
            onDispense={handleDispense}
            onDispenseRefill={handleDispenseRefill}
            onProcessReturn={handleProcessReturn}
            isProcessingReturn={
              processingReturnRxId === selectedPrescription?.id
            }
            updateStatus={updatePrescriptionStatus}
            isUpdatingStatus={updatingStatusId === selectedPrescription.id}
          />
        )}
      </ResponsiveDetailPanel>

      {/* Full Screen Overlay for New Prescription: top/bottom padding clears the status bar / Tauri title bar and home indicator */}
      {showNewPrescription && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div
            className="flex items-center gap-3 px-4 pb-4 border-b border-border bg-card shrink-0"
            style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1rem)" }}
          >
            <div
              className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
              onClick={closeNewPrescription}
            >
              <ArrowLeft className="w-[17px] h-[17px]" />
            </div>
            <h2 className="text-[17px] font-serif font-bold">
              New Prescription
            </h2>
          </div>
          <div
            className="flex-1 overflow-y-auto p-4"
            style={{
              paddingBottom:
                "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
            }}
          >
            <div className="max-w-4xl mx-auto">
              <NewPrescription />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
