import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  usePrescriptionQueue,
  Prescription,
} from "@/lib/hooks/use-prescription-queue";
import { getSaleForPrescription } from "@/lib/db/queries/sales";

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * All business logic for the Prescription Management page — the prescription
 * queue itself (via usePrescriptionQueue), the full-screen "new prescription"
 * overlay's URL-driven visibility, and navigation into POS/Returns for
 * dispense/refill/return actions — so the component only has to render what
 * this hook returns.
 */
export function usePrescriptionManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showNewPrescription =
    searchParams.get("action") === "add" || !!searchParams.get("edit_rx");

  const closeNewPrescription = () => {
    router.push("/prescriptions");
  };

  const queue = usePrescriptionQueue();

  const handleEdit = (prescription: Prescription) => {
    // Navigate to edit form, could just show new prescription with ID.
    // Close the detail side panel first — otherwise it stays open on top of
    // (and blocks interaction with) the full-screen edit overlay underneath.
    queue.setSelectedPrescription(null);
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

  const [processingReturnRxId, setProcessingReturnRxId] = useState<
    string | null
  >(null);

  const handleProcessReturn = async (prescription: Prescription) => {
    // A prescription-linked sale is the actual source of truth for stock/
    // payment — "cancelling" a prescription used to just relabel its status
    // without touching either. Route to the real Return flow instead, which
    // reverses stock/payment and (on a full return) reverts the rx to
    // "ready" itself (see return-dialog.tsx).
    setProcessingReturnRxId(prescription.id);
    try {
      const sale = await getSaleForPrescription(prescription.id);
      if (!sale) {
        toast.error(
          "No linked sale found for this prescription — nothing to return.",
        );
        return;
      }
      router.push(`/pos?tab=history&return_sale=${sale.id}`);
    } finally {
      setProcessingReturnRxId(null);
    }
  };

  return {
    ...queue,
    showNewPrescription,
    closeNewPrescription,
    formatDateTime,
    handleEdit,
    handleDispense,
    handleDispenseRefill,
    handleProcessReturn,
    processingReturnRxId,
  };
}
