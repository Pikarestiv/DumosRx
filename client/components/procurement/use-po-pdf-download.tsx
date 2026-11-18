import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { errorDescription } from "@/lib/utils/error-description";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { downloadBlob } from "@/lib/utils/download-blob";
import { shareOrDownload } from "@/lib/utils/share-file";
import { poStatusLabel } from "./po-status-labels";
import { useStore } from "@/lib/context/store-context";
import { capitalizeWords } from "@/lib/hooks/use-uppercase-display";
import type { PurchaseOrder } from "@/lib/db/procurement";

export function usePoPdfDownload(po: PurchaseOrder | null) {
  const { storeProfile } = useStore();
  const uppercaseNames = storeProfile?.uppercase_display_enabled !== 0;
  const [isGenerating, setIsGenerating] = useState(false);

  const build = async (po: PurchaseOrder) => {
    // Both imported here rather than at module scope:
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-purchase-order-details-tsx-L63
    const [{ pdf }, { PurchaseOrderPdf }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./purchase-order-pdf"),
    ]);
    const poNumber = `PO-${po.id.split("-")[0].toUpperCase()}`;
    const blob = await pdf(
      <PurchaseOrderPdf
        storeName={storeProfile?.name || "Store"}
        currencyCode={storeProfile?.currency}
        poNumber={poNumber}
        vendorName={po.vendor_name || "Unknown Vendor"}
        createdAt={formatDateToDDMMYYYY(po.created_at)}
        status={poStatusLabel(po.status)}
        notes={po.notes}
        items={(po.items || []).map((item) => ({
          // Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-purchase-order-details-tsx-pdf-names
          product_name: item.product_name
            ? uppercaseNames
              ? item.product_name.toUpperCase()
              : capitalizeWords(item.product_name)
            : "Unknown Product",
          bulk_quantity: item.bulk_quantity || 0,
          unit_cost: item.unit_cost || 0,
          subtotal: item.subtotal || 0,
        }))}
        totalAmount={po.total_amount || 0}
        generatedAt={format(new Date(), "d MMM yyyy, h:mm a")}
      />,
    ).toBlob();
    return { blob, poNumber };
  };

  const run = async (mode: "download" | "share", override?: PurchaseOrder | null) => {
    const order = override ?? po;
    if (!order || isGenerating) return;
    setIsGenerating(true);
    try {
      const { blob, poNumber } = await build(order);
      if (mode === "download") {
        downloadBlob(blob, `${poNumber}.pdf`);
        toast.success("PO downloaded successfully");
        return;
      }
      const outcome = await shareOrDownload(blob, `${poNumber}.pdf`, poNumber);
      if (outcome === "downloaded") toast.success("PO downloaded, ready to send to the vendor");
    } catch (error) {
      console.error("Failed to generate PO PDF:", error);
      toast.error("Couldn't build the PO PDF", {
        description: errorDescription(error),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    download: (override?: PurchaseOrder | null) => run("download", override),
    share: (override?: PurchaseOrder | null) => run("share", override),
    isGenerating,
  };
}
