"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, FileText, Pill } from "lucide-react";
import { Prescription } from "@/lib/hooks/use-prescription-queue";
import { formatCurrency } from "@/lib/utils";

interface PrescriptionDetailsDialogProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getStatusBadge: (status: Prescription["status"]) => React.ReactNode;
  getPriorityBadge: (priority: Prescription["priority"]) => React.ReactNode;
  formatDateTime: (dateString: string) => string;
}

export function PrescriptionDetailsDialog({
  prescription,
  open,
  onOpenChange,
  getStatusBadge,
  getPriorityBadge,
  formatDateTime,
}: PrescriptionDetailsDialogProps) {
  if (!prescription) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold">Prescription Details</DialogTitle>
          <DialogDescription>
            {prescription.prescriptionNumber} - {prescription.patientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Patient Information */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif font-semibold flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{prescription.patientName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{prescription.patientPhone || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Age</p>
                  <p className="font-medium">{prescription.patientAge || "-"} years</p>
                </div>
                {prescription.insurance && (
                  <div>
                    <p className="text-sm text-muted-foreground">Insurance</p>
                    <p className="font-medium">{prescription.insurance}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Doctor Information */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Prescriber Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Doctor</p>
                  <p className="font-medium">{prescription.doctorName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">License Number</p>
                  <p className="font-medium">{prescription.doctorLicense || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date Issued</p>
                  <p className="font-medium">{formatDateTime(prescription.dateIssued)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Priority</p>
                  <p className="font-medium">{getPriorityBadge(prescription.priority)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Medications */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Prescribed Medications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {prescription.medications.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No medications listed</p>
              ) : (
                <div className="space-y-4">
                  {prescription.medications.map((medication) => (
                    <div key={medication.id} className="p-4 border border-border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{medication.medicineName}</h4>
                            <Badge
                              variant={medication.available ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {medication.available ? "Available" : "Out of Stock"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Strength: {medication.strength || "-"} • Quantity: {medication.quantity}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Dosage: {medication.dosage || "-"}
                          </p>
                          {medication.instructions && (
                            <p className="text-sm mt-2 p-2 bg-muted rounded text-muted-foreground">
                              Instructions: {medication.instructions}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(medication.cost)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="font-bold">Total Cost:</span>
                  <span className="font-bold text-lg">{formatCurrency(prescription.totalCost)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {prescription.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif font-semibold">Clinical Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  {prescription.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
