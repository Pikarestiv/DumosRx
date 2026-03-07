"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Eye,
  FileText,
  Phone,
} from "lucide-react";
import { usePrescriptionQueue, Prescription } from "@/lib/hooks/use-prescription-queue";
import { PrescriptionStats } from "./prescription-stats";
import { PrescriptionDetailsDialog } from "./prescription-details-dialog";
import { formatCurrency } from "@/lib/utils";

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
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-48" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <PrescriptionStats stats={stats} />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Prescription Queue
          </CardTitle>
          <CardDescription>
            Manage and track prescription processing workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prescriptions, patients, doctors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="dispensed">Dispensed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Prescriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Active Prescriptions
          </CardTitle>
          <CardDescription>
            Showing {filteredPrescriptions.length} of {prescriptions.length}{" "}
            prescriptions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date Issued</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Medications</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrescriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileText className="h-8 w-8 mb-2 opacity-50" />
                        <p className="font-medium">No prescriptions found</p>
                        <p className="text-sm">
                          {prescriptions.length === 0
                            ? "Prescriptions will appear here as they're added"
                            : "Try adjusting your search or filters"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPrescriptions.map((prescription) => (
                    <TableRow key={prescription.id}>
                      <TableCell>
                        <div>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {prescription.prescriptionNumber}
                          </code>
                          {prescription.insurance && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Insurance: {prescription.insurance}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {prescription.patientName}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {prescription.patientPhone || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Age: {prescription.patientAge || "-"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {prescription.doctorName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {prescription.doctorLicense}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(prescription.dateIssued)}
                      </TableCell>
                      <TableCell>
                        {getPriorityBadge(prescription.priority)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(prescription.status)}
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          <span className="font-medium">
                            {prescription.medications.length}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {prescription.medications.some(
                              (m) => !m.available,
                            ) && (
                              <span className="text-red-600">
                                Some unavailable
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {formatCurrency(prescription.totalCost)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              viewPrescriptionDetails(prescription)
                            }
                            className="cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {prescription.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updatePrescriptionStatus(
                                  prescription.id,
                                  "in_progress",
                                )
                              }
                              className="cursor-pointer"
                            >
                              Start
                            </Button>
                          )}
                          {prescription.status === "in_progress" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updatePrescriptionStatus(
                                  prescription.id,
                                  "ready",
                                )
                              }
                              className="cursor-pointer"
                            >
                              Ready
                            </Button>
                          )}
                          {prescription.status === "ready" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updatePrescriptionStatus(
                                  prescription.id,
                                  "dispensed",
                                )
                              }
                              className="cursor-pointer"
                            >
                              Dispense
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
