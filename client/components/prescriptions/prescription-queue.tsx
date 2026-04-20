"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrescriptionQueue, Prescription } from "@/lib/hooks/use-prescription-queue";
import { PrescriptionStats } from "./prescription-stats";
import { PrescriptionDetailsDialog } from "./prescription-details-dialog";
import { formatCurrency } from "@/lib/utils";
import { PrescriptionFilterCard } from "./prescription-filter-card";
import { PrescriptionTable } from "./prescription-table";

export function PrescriptionQueue() {
  const {
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    filteredPrescriptions,
    selectedPrescription,
    showDetailsDialog,
    setShowDetailsDialog,
    updatePrescriptionStatus,
    viewPrescriptionDetails,
    stats,
    prescriptions,
  } = usePrescriptionQueue();

  const getStatusBadge = (status: Prescription["status"]) => {
    const variants = {
      pending: "outline",
      in_progress: "secondary",
      ready: "default",
      dispensed: "default",
      on_hold: "destructive",
    } as const;

    const labels = {
      pending: "Pending",
      in_progress: "In Progress",
      ready: "Ready",
      dispensed: "Dispensed",
      on_hold: "On Hold",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: Prescription["priority"]) => {
    const colors = {
      normal: "text-muted-foreground",
      urgent: "text-orange-600",
      stat: "text-red-600",
    };

    const labels = {
      normal: "Normal",
      urgent: "Urgent",
      stat: "STAT",
    };

    return (
      <span className={`text-xs font-medium ${colors[priority]}`}>
        {labels[priority]}
      </span>
    );
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-12" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PrescriptionStats stats={stats} />

      <PrescriptionFilterCard 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
      />

      <PrescriptionTable 
        prescriptions={filteredPrescriptions}
        filteredCount={filteredPrescriptions.length}
        totalCount={prescriptions.length}
        formatCurrency={formatCurrency}
        formatDateTime={formatDateTime}
        getStatusBadge={getStatusBadge}
        getPriorityBadge={getPriorityBadge}
        viewDetails={viewPrescriptionDetails}
        updateStatus={updatePrescriptionStatus}
      />

      <PrescriptionDetailsDialog
        prescription={selectedPrescription}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        getPriorityBadge={getPriorityBadge}
        formatDateTime={formatDateTime}
      />
    </div>
  );
}
