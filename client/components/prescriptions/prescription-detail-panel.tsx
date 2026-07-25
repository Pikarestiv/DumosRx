"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User,
  FileText,
  Pill,
  ArrowLeft,
  Edit,
  Pill as PillIcon,
  CheckCircle,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Prescription } from "@/lib/hooks/use-prescription-queue";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PRESCRIPTION_STATUS_META,
  getInitials,
} from "./prescription-status-meta";

interface PrescriptionDetailPanelProps {
  prescription: Prescription | null;
  getPriorityBadge: (priority: Prescription["priority"]) => React.ReactNode;
  formatDateTime: (dateString: string) => string;
  onClose: () => void;
  onEdit: (prescription: Prescription) => void;
  onDispense: (prescription: Prescription) => void;
  onDispenseRefill: (prescription: Prescription) => void;
  onProcessReturn: (prescription: Prescription) => void;
  isProcessingReturn?: boolean;
  updateStatus: (id: string, status: Prescription["status"]) => void;
}

export function PrescriptionDetailPanel({
  prescription,
  getPriorityBadge,
  formatDateTime,
  onClose,
  onEdit,
  onDispense,
  onDispenseRefill,
  onProcessReturn,
  isProcessingReturn = false,
  updateStatus,
}: PrescriptionDetailPanelProps) {
  if (!prescription) {
    return (
      <Card className="hidden lg:flex flex-col h-full items-center justify-center bg-card rounded-2xl border border-border text-muted-foreground p-6 shadow-sm">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-muted-foreground/60" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          No Prescription Selected
        </h3>
        <p className="text-sm text-center max-w-[250px]">
          Select a prescription from the list to view its details, update
          status, or dispense medications.
        </p>
      </Card>
    );
  }

  // Action helper
  const renderActions = () => {
    switch (prescription.status) {
      case "pending":
        return (
          <div className="flex w-full justify-between gap-2">
            <Button
              size="sm"
              onClick={() => updateStatus(prescription.id, "in_progress")}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Process
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(prescription)}
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
          </div>
        );
      case "in_progress":
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => updateStatus(prescription.id, "ready")}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Mark Ready
            </Button>
          </div>
        );
      case "ready":
        return (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onDispense(prescription)}>
              <PillIcon className="w-4 h-4 mr-1" />
              Dispense
            </Button>
          </div>
        );
      case "dispensed":
      case "completed":
        return (
          <div className="flex w-full justify-between gap-2">
            {!!prescription.hasRefillDue && (
              <Button size="sm" onClick={() => onDispenseRefill(prescription)}>
                <PillIcon className="w-4 h-4 mr-1" />
                Dispense Refill
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={isProcessingReturn}
              onClick={() => onProcessReturn(prescription)}
            >
              {isProcessingReturn ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-1" />
              )}
              Process Return
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  const statusMeta = PRESCRIPTION_STATUS_META[prescription.status];

  return (
    <Card className="fixed inset-0 z-50 lg:static lg:z-auto bg-background lg:bg-card lg:rounded-xl lg:border lg:border-border flex flex-col h-full shadow-sm p-0 pb-4 gap-0 overflow-hidden">
      {/* Header — top padding on mobile/tablet clears the status bar / Tauri title bar */}
      <div className="flex items-center gap-3 px-4 pb-4 pt-[calc(var(--tauri-top,0px)+1rem)] lg:pt-4 border-b border-border">
        <div
          className="lg:hidden w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
          onClick={onClose}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </div>
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
          {getInitials(prescription.patientName)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold truncate">
            {prescription.patientName}
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {prescription.prescriptionNumber}
          </p>
        </div>

        <span
          className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap ${statusMeta.badgeClass}`}
        >
          {statusMeta.label}
        </span>
      </div>

      {/* Actions Row — fixed, doesn't scroll away with the content below */}
      {renderActions() && (
        <div className="shrink-0 flex flex-wrap gap-2 items-center justify-end p-4 lg:p-3 bg-accent/20 border-b border-accent">
          {renderActions()}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(var(--tauri-bottom,env(safe-area-inset-bottom,0px))+1rem)] lg:pb-4 space-y-6">
        <div className="grid grid-cols-1 gap-6">
          {/* Patient Information */}
          <Card className="shadow-none border-border py-0 gap-0">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium text-sm">
                  {prescription.patientName}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium text-sm">
                    {prescription.patientPhone || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Age</p>
                  <p className="font-medium text-sm">
                    {prescription.patientAge || "N/A"}
                  </p>
                </div>
              </div>
              {prescription.insurance && (
                <div>
                  <p className="text-xs text-muted-foreground">Insurance</p>
                  <p className="font-medium text-sm">
                    {prescription.insurance}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Doctor Information */}
          <Card className="shadow-none border-border py-0 gap-0">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Prescriber Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Doctor</p>
                <p className="font-medium text-sm">{prescription.doctorName}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    License Number
                  </p>
                  <p className="font-medium text-sm">
                    {prescription.doctorLicense || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <div className="font-medium text-sm mt-0.5">
                    {getPriorityBadge(prescription.priority)}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date Issued</p>
                <p className="font-medium text-sm">
                  {formatDateTime(prescription.dateIssued)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Medications */}
        <Card className="shadow-none border-border py-0 gap-0">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Prescribed Medications
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {prescription.medications.length === 0 && (
              <p className="text-muted-foreground text-center py-4 text-sm">
                No medications listed
              </p>
            )}
            {!(prescription.medications.length === 0) && (
              <div className="space-y-3">
                {prescription.medications.map((medication) => (
                  <div
                    key={medication.id}
                    className="p-3 bg-muted/30 rounded-lg border border-border"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm text-foreground">
                            {medication.productName}
                          </h4>
                          <Badge
                            variant={
                              medication.available ? "default" : "destructive"
                            }
                            className="text-[10px] px-1.5 py-0"
                          >
                            {!!medication.available && "Available"}
                            {!medication.available && "Out of Stock"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Strength: {medication.strength || "-"} • Qty:{" "}
                          {medication.quantity}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Dosage: {medication.dosage || "-"}
                        </p>
                        {medication.instructions && (
                          <p className="text-xs mt-2 p-1.5 bg-background rounded text-muted-foreground border border-border/50">
                            {medication.instructions}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          {formatCurrency(medication.cost)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">Total Cost:</span>
                <span className="font-bold text-base text-primary">
                  {formatCurrency(prescription.totalCost)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {prescription.notes && (
          <Card className="shadow-none border-border py-0">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">
                Clinical Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-900 dark:text-yellow-100">
                {prescription.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Card>
  );
}
