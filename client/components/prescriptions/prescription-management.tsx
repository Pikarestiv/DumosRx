"use client"
import { usePrescriptionQueue, Prescription } from "@/lib/hooks/use-prescription-queue";
import { PrescriptionStats } from "./prescription-stats";
import { PrescriptionList } from "./prescription-list";
import { PrescriptionSearchBar } from "./prescription-search-bar";
import { PrescriptionDetailPanel } from "./prescription-detail-panel";
import { NewPrescription } from "./new-prescription";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSearchParams } from "next/navigation";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Needs verification" },
  { value: "refill_due", label: "Refills due" },
  { value: "ready", label: "Ready for pickup" },
  { value: "completed", label: "History" },
];

export function PrescriptionManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showNewPrescription = searchParams.get("action") === "add" || !!searchParams.get("edit_rx");

  const closeNewPrescription = () => {
    router.push("/prescriptions");
  };

  const {
    loading: _loading,
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
  } = usePrescriptionQueue();

  const getPriorityBadge = (priority: Prescription["priority"]) => {
    const colors = {
      normal: "text-muted-foreground",
      urgent: "text-orange-600 font-bold",
      stat: "text-red-600 font-bold",
    };
    const labels = {
      normal: "Normal",
      urgent: "Urgent",
      stat: "STAT",
    };
    return <span className={`text-xs ${colors[priority]}`}>{labels[priority]}</span>;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleEdit = (prescription: Prescription) => {
    // Navigate to edit form, could just show new prescription with ID
    router.push(`/prescriptions?action=add&edit_rx=${prescription.id}`);
  };

  const handleDispense = (prescription: Prescription) => {
    // Hand off to POS to actually deduct stock and record the sale — POS
    // marks the prescription "completed" itself once payment succeeds
    // (see usePOSPrescription / use-pos-payment.ts).
    router.push(`/pos?dispense_rx=${prescription.id}`);
  };

  const handleDispenseRefill = (prescription: Prescription) => {
    // Same POS flow, but flagged as a refill so payment completion bumps
    // refills_used/next_refill_date instead of re-marking the rx "completed".
    router.push(`/pos?dispense_rx=${prescription.id}&refill=1`);
  };

  return (
    <div className="space-y-6">

      <PrescriptionStats stats={stats} />

      {/* Mobile: search bar stands alone above the filter chips, own bg-card to contrast with the page */}
      <div className="lg:hidden">
        <PrescriptionSearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} className="bg-card border-border" />
      </div>

      {/* FILTER CHIPS — mobile: chips variant with bg-card/border-border inactive state; desktop: unchanged default Tabs */}
      <div className="mb-4">
        <div className="lg:hidden">
          <Tabs value={statusFilter} onValueChange={setStatusFilter} variant="chips">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
              {STATUS_FILTERS.map((f) => (
                <TabsTrigger
                  key={f.value}
                  value={f.value}
                  className="data-[state=inactive]:bg-card data-[state=inactive]:border-border"
                >
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="hidden lg:block">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="w-max justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
              {STATUS_FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Grid Layout — both panes stretch to match the taller one on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] lg:grid-rows-1 gap-6 lg:h-[calc(100vh-320px)] lg:min-h-[500px]">
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
        <div className={`
          ${selectedPrescription ? "block" : "hidden"}
          lg:block lg:h-full
        `}>
          {!!(selectedPrescription) && (
                              <PrescriptionDetailPanel
                                prescription={selectedPrescription}
                                getPriorityBadge={getPriorityBadge}
                                formatDateTime={formatDateTime}
                                onClose={() => setSelectedPrescription(null)}
                                onEdit={handleEdit}
                                onDispense={handleDispense}
                                onDispenseRefill={handleDispenseRefill}
                                updateStatus={updatePrescriptionStatus}
                              />
                            )}
                  {!(selectedPrescription) && (
                              <Card className="lg:h-full min-h-[400px] border border-border bg-card rounded-xl flex items-center justify-center flex-col text-center p-6 text-muted-foreground shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                                <svg className="w-16 h-16 text-muted-foreground/30 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <polyline points="10 9 9 9 8 9" />
                                </svg>
                                <h3 className="text-lg font-medium text-foreground mb-1">No Prescription Selected</h3>
                                <p className="text-sm max-w-[250px]">Select a prescription from the queue to view its details, medications, and verify instructions.</p>
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
            <h2 className="text-[17px] font-serif font-bold">New Prescription</h2>
          </div>
          <div
            className="flex-1 overflow-y-auto p-4"
            style={{ paddingBottom: "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)" }}
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
