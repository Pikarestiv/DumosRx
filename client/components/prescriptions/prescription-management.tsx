"use client";
import { usePrescriptionManagement } from "@/lib/hooks/use-prescription-management";
import { PrescriptionStats } from "./prescription-stats";
import { PrescriptionList } from "./prescription-list";
import { PrescriptionSearchBar } from "./prescription-search-bar";
import { PrescriptionDetailPanel } from "./prescription-detail-panel";
import { PriorityBadge } from "./priority-badge";
import { NewPrescription } from "./new-prescription";
import { Card } from "@/components/ui/card";
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
    stats,
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
      <PrescriptionStats stats={stats} />

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

      {/* Grid Layout — both panes stretch to match the taller one on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] lg:grid-rows-1 gap-6 lg:flex-1 lg:min-h-0">
        {/* Left List */}
        <PrescriptionList
          prescriptions={filteredPrescriptions}
          selectedPrescription={selectedPrescription}
          onSelect={setSelectedPrescription}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          isFuzzyFallback={isFuzzyFallback}
        />

        {/* Right Detail Panel */}
        <div
          className={`
          ${selectedPrescription ? "block" : "hidden"}
          lg:block lg:h-full
        `}
        >
          {!!selectedPrescription && (
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
            />
          )}
          {!selectedPrescription && (
            <Card className="lg:h-full min-h-[400px] border border-border bg-card rounded-xl flex items-center justify-center flex-col text-center p-6 text-muted-foreground shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
              <svg
                className="w-16 h-16 text-muted-foreground/30 mb-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <h3 className="text-lg font-medium text-foreground mb-1">
                No Prescription Selected
              </h3>
              <p className="text-sm max-w-[250px]">
                Select a prescription from the queue to view its details,
                medications, and verify instructions.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Full Screen Overlay for New Prescription — top/bottom padding clears the status bar / Tauri title bar and home indicator */}
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
