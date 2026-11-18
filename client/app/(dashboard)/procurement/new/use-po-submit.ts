import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-details-fields";
import { dueDateToSave, getValidatedAmountPaid, quantityMissingMessage } from "@/components/procurement/po-line-item-math";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { errorDescription } from "@/lib/utils/error-description";
import {
  useCreatePurchaseOrderMutation,
  useCreateAndReceivePurchaseOrderMutation,
} from "@/lib/hooks/use-purchase-order-mutations";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";

interface UsePoSubmitArgs {
  selectedSupplierId: string;
  notes: string;
  items: POLineItemDraft[];
  paymentStatus: string;
  amountPaid: string;
  dueDate: string;
  totalAmount: number;
}

export function usePoSubmit({
  selectedSupplierId,
  notes,
  items,
  paymentStatus,
  amountPaid,
  dueDate,
  totalAmount,
}: UsePoSubmitArgs) {
  const router = useRouter();
  const displayName = useDisplayName();
  const createPurchaseOrderMutation = useCreatePurchaseOrderMutation();
  const createAndReceivePurchaseOrderMutation =
    useCreateAndReceivePurchaseOrderMutation();
  const isSubmitting =
    createPurchaseOrderMutation.isPending ||
    createAndReceivePurchaseOrderMutation.isPending;
  const isWalkIn = selectedSupplierId === SELF_PURCHASE_VENDOR_ID;

  const canSubmit = ({ requireQuantities = true } = {}) => {
    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return false;
    }
    const missingQuantity = requireQuantities ? quantityMissingMessage(items, displayName) : null;
    if (missingQuantity) {
      toast.error(missingQuantity);
      return false;
    }
    return !isSubmitting;
  };

  const buildPayload = () => ({
    supplierId: isWalkIn ? null : selectedSupplierId,
    notes,
    items,
    paymentStatus,
    amountPaid: paymentStatus === "unpaid" ? 0 : paymentStatus === "paid" ? totalAmount : getValidatedAmountPaid(amountPaid, totalAmount),
    dueDate: dueDateToSave(paymentStatus, dueDate),
  });

  const onFailure = (title: string) => (error: unknown) => {
    console.error(title, error);
    toast.error(title, { description: errorDescription(error) });
  };

  const handleReceive = () => {
    if (!canSubmit()) return;
    createAndReceivePurchaseOrderMutation.mutate(buildPayload(), {
      onSuccess: (poId) => {
        toast.success("Purchase received", {
          description: "Stock has been added to inventory.",
        });
        router.push(`/procurement?selected=${poId}`);
      },
      onError: onFailure("Couldn't save this purchase"),
    });
  };

  const handleSend = () => {
    if (isWalkIn) {
      toast.error("Choose the vendor this order is going to");
      return;
    }
    if (!canSubmit()) return;
    createPurchaseOrderMutation.mutate(
      { ...buildPayload(), status: "sent" },
      {
        onSuccess: (poId) => {
          toast.success("Order marked as ordered", {
            description: "Download its PDF from the order to share it with the vendor.",
          });
          router.push(`/procurement?selected=${poId}`);
        },
        onError: onFailure("Couldn't save this order"),
      },
    );
  };

  const handleSaveDraft = () => {
    if (!canSubmit({ requireQuantities: false })) return;
    createPurchaseOrderMutation.mutate(buildPayload(), {
      onSuccess: (poId) => {
        toast.success("Saved as draft", {
          description: "Pick up where you left off any time, then receive it or send it to the vendor.",
        });
        router.push(`/procurement?selected=${poId}`);
      },
      onError: onFailure("Couldn't save the draft"),
    });
  };

  return { isSubmitting, isWalkIn, handleReceive, handleSend, handleSaveDraft };
}
