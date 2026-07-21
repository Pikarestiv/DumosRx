"use client"
import { useState } from "react";
import { usePrescriptionQueue, Prescription } from "@/lib/hooks/use-prescription-queue";
import { PrescriptionStats } from "./prescription-stats";
import { PrescriptionList } from "./prescription-list";
import { PrescriptionDetailPanel } from "./prescription-detail-panel";
import { NewPrescription } from "./new-prescription";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSearchParams } from "next/navigation";

export function PrescriptionManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showNewPrescription = searchParams.get("action") === "add" || !!searchParams.get("edit_rx");

  const closeNewPrescription = () => {
    router.push("/prescriptions");
  };

  const {
    loading,
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
    updatePrescriptionStatus(prescription.id, "dispensed");
  };

  return (
    <div className="space-y-6">

      <PrescriptionStats stats={stats} />

      {/* FILTER CHIPS (using global Tabs) */}
      <div className="mb-4">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Needs verification</TabsTrigger>
            <TabsTrigger value="refill_due">Refills due</TabsTrigger>
            <TabsTrigger value="ready">Ready for pickup</TabsTrigger>
            <TabsTrigger value="completed">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Left List */}
        <PrescriptionList
          prescriptions={filteredPrescriptions}
          selectedPrescription={selectedPrescription}
          onSelect={setSelectedPrescription}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          isFuzzyFallback={isFuzzyFallback}
        />

        {/* Right Detail Panel */}
        <div className={`
          ${selectedPrescription ? "block" : "hidden"} 
          lg:block lg:sticky lg:top-4
        `}>
          <PrescriptionDetailPanel
            prescription={selectedPrescription}
            getPriorityBadge={getPriorityBadge}
            formatDateTime={formatDateTime}
            onClose={() => setSelectedPrescription(null)}
            onEdit={handleEdit}
            onDispense={handleDispense}
            updateStatus={updatePrescriptionStatus}
          />
        </div>
      </div>

      {/* Full Screen Overlay for New Prescription */}
      {showNewPrescription && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card">
            <h2 className="text-xl font-semibold font-serif">New Prescription</h2>
            <Button variant="ghost" size="icon" onClick={closeNewPrescription}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              <NewPrescription />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
