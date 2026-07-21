"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, FileText, Pill, X, Edit, Pill as PillIcon, CheckCircle, RotateCcw } from "lucide-react";
import { Prescription } from "@/lib/hooks/use-prescription-queue";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PrescriptionDetailPanelProps {
  prescription: Prescription | null;
  getPriorityBadge: (priority: Prescription["priority"]) => React.ReactNode;
  formatDateTime: (dateString: string) => string;
  onClose: () => void;
  onEdit: (prescription: Prescription) => void;
  onDispense: (prescription: Prescription) => void;
  updateStatus: (id: string, status: Prescription["status"]) => void;
}

export function PrescriptionDetailPanel({
  prescription,
  getPriorityBadge,
  formatDateTime,
  onClose,
  onEdit,
  onDispense,
  updateStatus,
}: PrescriptionDetailPanelProps) {
  if (!prescription) {
    return (
      <div className="hidden md:flex flex-col h-full items-center justify-center bg-card rounded-2xl border border-border text-muted-foreground p-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-muted-foreground/60" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">No Prescription Selected</h3>
        <p className="text-sm text-center max-w-[250px]">Select a prescription from the list to view its details, update status, or dispense medications.</p>
      </div>
    );
  }

  // Action helper
  const renderActions = () => {
    switch (prescription.status) {
      case "pending":
        return (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateStatus(prescription.id, "in_progress")}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Process
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEdit(prescription)}>
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
          </div>
        );
      case "in_progress":
        return (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateStatus(prescription.id, "ready")}>
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
          <div className="flex gap-2">
             <Button size="sm" variant="outline" onClick={() => updateStatus(prescription.id, "cancelled")}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Cancel
             </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 md:static md:z-auto bg-background md:bg-card md:rounded-xl md:border md:border-border flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold font-serif">Rx Details</h2>
          <p className="text-sm text-muted-foreground">{prescription.prescriptionNumber}</p>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Actions Row */}
        <div className="flex flex-wrap gap-2 items-center justify-between p-3 bg-accent/20 rounded-lg border border-accent">
           <div>
             <div className="text-xs text-muted-foreground mb-1">Current Status</div>
             <div className="font-medium capitalize">{prescription.status.replace("_", " ")}</div>
           </div>
           {renderActions()}
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Patient Information */}
          <Card className="shadow-none border-border">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium text-sm">{prescription.patientName}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium text-sm">{prescription.patientPhone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Age</p>
                  <p className="font-medium text-sm">{prescription.patientAge || "-"} years</p>
                </div>
              </div>
              {prescription.insurance && (
                <div>
                  <p className="text-xs text-muted-foreground">Insurance</p>
                  <p className="font-medium text-sm">{prescription.insurance}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Doctor Information */}
          <Card className="shadow-none border-border">
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
                  <p className="text-xs text-muted-foreground">License Number</p>
                  <p className="font-medium text-sm">{prescription.doctorLicense || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <div className="font-medium text-sm mt-0.5">{getPriorityBadge(prescription.priority)}</div>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date Issued</p>
                <p className="font-medium text-sm">{formatDateTime(prescription.dateIssued)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Medications */}
        <Card className="shadow-none border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Prescribed Medications
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {prescription.medications.length === 0 ? (
              <p className="text-muted-foreground text-center py-4 text-sm">No medications listed</p>
            ) : (
              <div className="space-y-3">
                {prescription.medications.map((medication) => (
                  <div key={medication.id} className="p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm text-foreground">{medication.productName}</h4>
                          <Badge
                            variant={medication.available ? "default" : "destructive"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {medication.available ? "Available" : "Out of Stock"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Strength: {medication.strength || "-"} • Qty: {medication.quantity}
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
                        <p className="font-semibold text-sm">{formatCurrency(medication.cost)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">Total Cost:</span>
                <span className="font-bold text-base text-primary">{formatCurrency(prescription.totalCost)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {prescription.notes && (
          <Card className="shadow-none border-border">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Clinical Notes</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-900 dark:text-yellow-100">
                {prescription.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
