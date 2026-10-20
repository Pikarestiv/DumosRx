import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  usePrescriptionQueue,
  Prescription,
} from "@/lib/hooks/use-prescription-queue";
import { getSaleForPrescription } from "@/lib/db/queries/sales";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { formatDateTime } from "@/lib/utils";

// All business logic for the Prescription Management page:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-prescription-management-L12
export function usePrescriptionManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManagePrescriptions = useHasPermission("manage_prescriptions");
  const showNewPrescription =
    canManagePrescriptions &&
    (searchParams.get("action") === "add" || !!searchParams.get("edit_rx"));

  const closeNewPrescription = () => {
    router.push("/prescriptions");
  };

  const queue = usePrescriptionQueue();

  const handleEdit = (prescription: Prescription) => {
    // Navigate to edit form, could just show new prescription with ID.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-prescription-management-ts-L29
    queue.setSelectedPrescription(null);
    router.push(`/prescriptions?action=add&edit_rx=${prescription.id}`);
  };

  const handleDispense = (prescription: Prescription) => {
    // Hand off to POS to actually deduct stock and record the sale.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-prescription-management-ts-L37
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
    // A prescription-linked sale is the actual source of truth for stock/ payment:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-prescription-management-ts-L54
    setProcessingReturnRxId(prescription.id);
    try {
      const sale = await getSaleForPrescription(prescription.id);
      if (!sale) {
        toast.error(
          "No linked sale found for this prescription; nothing to return.",
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
