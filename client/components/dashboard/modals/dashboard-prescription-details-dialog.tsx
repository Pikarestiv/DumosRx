"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getPrescriptionItems } from "@/lib/db/queries/prescriptions";
import { Pill } from "lucide-react";
import { DetailRow } from "./detail-row";
import type { PrescriptionRow, PrescriptionItem } from "@/lib/types/prescription";

interface DashboardPrescriptionDetailsDialogProps {
  prescription: PrescriptionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  processing:
    "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30",
  dispensed:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
  completed:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
};

function NoMedicationsFound() {
  return (
    <div className="text-[13px] text-muted-foreground text-center py-4 flex flex-col items-center gap-2">
      <Pill className="w-6 h-6 opacity-30" />
      No medications found.
    </div>
  );
}

export function DashboardPrescriptionDetailsDialog({
  prescription,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: DashboardPrescriptionDetailsDialogProps) {
  const [items, setItems] = useState<PrescriptionItem[]>([]);

  useEffect(() => {
    if (prescription?.id && open) {
      getPrescriptionItems(prescription.id).then((res) => setItems(res || []));
    } else if (!open) {
      setItems([]);
    }
  }, [prescription?.id, open]);

  if (!prescription) return null;

  const status = (prescription.status || "pending").toLowerCase();
  const statusStyle =
    STATUS_STYLES[status] || "bg-muted/30 border-border text-foreground";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Prescription detail"
      className="sm:max-w-[480px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 py-4 pt-0 sm:pt-4 border-b border-border m-0"
    >
      <div className="px-5 py-[18px]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <Pill className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate">
              {prescription.patient_name || "Unknown patient"}
            </div>
            <div className="text-[12px] text-muted-foreground/70">
              {prescription.prescription_number} ·{" "}
              {formatDateTime(
                prescription.issued_at || prescription.created_at,
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block border ${statusStyle}`}
            >
              {prescription.status || "Pending"}
            </span>
            <div className="text-[18px] font-semibold text-primary mt-1">
              {formatCurrency(prescription.total_cost || 0, currencyCode)}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3.5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <DetailRow
              label="Phone"
              value={prescription.patient_phone || "N/A"}
            />
            <DetailRow label="Age" value={prescription.patient_age || "N/A"} />
            <DetailRow
              label="Doctor"
              value={prescription.doctor_name || "N/A"}
            />
            {prescription.created_by_name && (
              <DetailRow label="Created by" value={prescription.created_by_name} />
            )}
          </div>
          {prescription.notes && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                Notes
              </div>
              <div className="text-[13px] text-foreground bg-muted/30 p-3 rounded-md">
                {prescription.notes}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-2">
              Medications ({items.length})
            </div>
            <div className="flex flex-col gap-2">
              {items.map((med, index) => (
                <div
                  key={med.id || index}
                  className="p-2.5 rounded-lg border border-border bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {med.product_name}
                        {med.strength && (
                          <span className="text-[11px] text-muted-foreground ml-1.5">
                            {med.strength}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {med.dosage} · Qty: {med.quantity}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-semibold">
                        {formatCurrency(med.cost || 0, currencyCode)}
                      </div>
                      {(med.refills_authorized || 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {med.refills_authorized} refills
                        </div>
                      )}
                    </div>
                  </div>
                  {med.instructions && (
                    <div className="text-[11px] text-muted-foreground italic mt-1.5">
                      "{med.instructions}"
                    </div>
                  )}
                </div>
              ))}
              {items.length === 0 && <NoMedicationsFound />}
            </div>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
