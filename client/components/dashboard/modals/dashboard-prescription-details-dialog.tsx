"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { query } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, FileText, Pill } from "lucide-react";

interface DashboardPrescriptionDetailsDialogProps {
  prescription: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

export function DashboardPrescriptionDetailsDialog({
  prescription,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: DashboardPrescriptionDetailsDialogProps) {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (prescription?.id && open) {
      query<any>(
        "SELECT * FROM prescription_items WHERE prescription_id = ?",
        [prescription.id]
      ).then((res) => setItems(res || []));
    }
  }, [prescription?.id, open]);

  if (!prescription) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Prescription Details"
      description={`${prescription.prescription_number} - ${prescription.patient_name}`}
      className="sm:max-w-4xl"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
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
                <p className="font-medium">{prescription.patient_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{prescription.patient_phone || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Age</p>
                <p className="font-medium">{prescription.patient_age || "N/A"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Prescription Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Doctor</p>
                  <p className="font-medium">{prescription.doctor_name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className="mt-1 capitalize">
                    {prescription.status || "Pending"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date Issued</p>
                  <p className="font-medium">
                    {formatDateTime(prescription.issued_at || prescription.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="font-medium">
                    {formatCurrency(prescription.total_cost, currencyCode)}
                  </p>
                </div>
              </div>
              {prescription.notes && (
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm bg-muted/30 p-2 rounded-md mt-1">
                    {prescription.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif font-semibold flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Medications ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((med, index) => (
                <div
                  key={med.id || index}
                  className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-muted/20 rounded-lg border border-border/50"
                >
                  <div>
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                      {med.product_name}
                      {med.strength && (
                        <span className="text-xs text-muted-foreground">
                          {med.strength}
                        </span>
                      )}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {med.dosage} - Qty: {med.quantity}
                    </p>
                    {med.instructions && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        "{med.instructions}"
                      </p>
                    )}
                  </div>
                  <div className="mt-4 sm:mt-0 text-right">
                    <p className="font-medium">
                      {formatCurrency(med.cost, currencyCode)}
                    </p>
                    {med.refills_authorized > 0 && (
                      <Badge variant="secondary" className="mt-1">
                        {med.refills_authorized} Refills
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center p-4 text-muted-foreground">
                  Loading medications...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ResponsiveModal>
  );
}
