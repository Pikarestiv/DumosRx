import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-details-fields";
import { getValidatedAmountPaid, countSellingPriceOverrides } from "@/components/procurement/po-line-item-math";
import { errorDescription } from "@/lib/utils/error-description";
import {
  useCreatePurchaseOrderMutation,
  useCreateAndReceivePurchaseOrderMutation,
} from "@/lib/hooks/use-purchase-order-mutations";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { POProduct } from "@/lib/db/queries/procurement";

interface UsePoSubmitArgs {
  poType: "standard" | "immediate";
  selectedSupplierId: string;
  notes: string;
  items: POLineItemDraft[];
  paymentStatus: string;
  amountPaid: string;
  dueDate: string;
  totalAmount: number;
  products: POProduct[];
}

export function usePoSubmit({
  poType,
  selectedSupplierId,
  notes,
  items,
  paymentStatus,
  amountPaid,
  dueDate,
  totalAmount,
  products,
}: UsePoSubmitArgs) {
  const router = useRouter();
  const createPurchaseOrderMutation = useCreatePurchaseOrderMutation();
  const createAndReceivePurchaseOrderMutation =
    useCreateAndReceivePurchaseOrderMutation();
  const isSubmitting =
    createPurchaseOrderMutation.isPending ||
    createAndReceivePurchaseOrderMutation.isPending;

  const canSubmit = () => {
    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return false;
    }
    return !isSubmitting;
  };

  const buildPayload = () => ({
    supplierId:
      selectedSupplierId === SELF_PURCHASE_VENDOR_ID
        ? null
        : selectedSupplierId,
    notes,
    items,
    paymentStatus,
    amountPaid: paymentStatus === "unpaid" ? 0 : paymentStatus === "paid" ? totalAmount : getValidatedAmountPaid(amountPaid, totalAmount),
    dueDate: dueDate || null,
  });

  const handleSubmit = () => {
    if (!canSubmit()) return;

    if (poType === "immediate") {
      createAndReceivePurchaseOrderMutation.mutate(buildPayload(), {
        onSuccess: (poId) => {
          toast.success("Purchase received", {
            description: "Stock has been added to inventory.",
          });
          const priceOverrideCount = countSellingPriceOverrides(items, products);
          if (priceOverrideCount > 0) {
            toast.success(
              priceOverrideCount === 1
                ? "Selling price updated for 1 item"
                : `Selling price updated for ${priceOverrideCount} items`,
            );
          }
          router.push(`/procurement?selected=${poId}`);
        },
        onError: (error) => {
          console.error("Failed to create PO:", error);
          toast.error("Couldn't save this purchase", {
            description: errorDescription(error),
          });
        },
      });
    } else {
      createPurchaseOrderMutation.mutate(buildPayload(), {
        onSuccess: (poId) => {
          toast.success("Purchase order saved as draft", {
            description:
              "Remember to mark it as sent once it's on its way to the vendor.",
          });
          router.push(`/procurement?selected=${poId}`);
        },
        onError: (error) => {
          console.error("Failed to create PO:", error);
          toast.error("Couldn't save this purchase", {
            description: errorDescription(error),
          });
        },
      });
    }
  };

  // Parks an Immediate Purchase as an ordinary draft instead of receiving stock.
  // Rationale: docs/CLIENT_COMMENTS.md#block-app-(dashboard)-procurement-new-use-po-submit-ts-L109
  const handleSaveDraft = () => {
    if (!canSubmit()) return;

    createPurchaseOrderMutation.mutate(
      { ...buildPayload(), type: poType },
      {
        onSuccess: (poId) => {
          toast.success("Purchase order saved as draft", {
            description:
              poType === "immediate"
                ? "Pick up where you left off any time, receive it whenever you're ready."
                : "Remember to mark it as sent once it's on its way to the vendor.",
          });
          router.push(`/procurement?selected=${poId}`);
        },
        onError: (error) => {
          console.error("Failed to save PO draft:", error);
          toast.error("Couldn't save the draft", {
            description: errorDescription(error),
          });
        },
      },
    );
  };

  return { isSubmitting, handleSubmit, handleSaveDraft };
}
