import { Label } from "@/components/ui/label";
import { ReceiptView, type ReceiptTransaction } from "@/components/pos/receipt-view";
import type { ReceiptPaperSize } from "@/lib/hooks/use-receipt-paper-size";

interface ReceiptPreviewProps {
  localName: string;
  localAddress: string;
  localPhone: string;
  localLogo: string;
  localReceiptHeader: string;
  localReceiptFooter: string;
  localReceiptTagline: string;
  showLogo: boolean;
  logoPosition?: "above" | "beside";
  showPhone: boolean;
  showAddress: boolean;
  showBarcode: boolean;
  hidePoweredBy?: boolean;
  paperSize: ReceiptPaperSize;
}

const SAMPLE_ITEMS = [
  { id: "sample-1", name: "Item Name", quantity: 2, unit_price: 2500, subtotal: 5000 },
  { id: "sample-2", name: "Sample Med", quantity: 1, unit_price: 2500, subtotal: 2500 },
];

/** Overpaid and untaxed on purpose: it exercises Change and Total paid and
 * leaves Sub total hidden, exactly as an ordinary cash sale prints. */
function sampleTransaction(): ReceiptTransaction {
  return {
    id: "5a3f1c20-0000-4000-8000-000000000000",
    date: new Date().toISOString(),
    cashier: "Admin User",
    items: SAMPLE_ITEMS,
    customer: null,
    subtotal: 7500,
    tax: 0,
    discount: 0,
    total: 7500,
    paymentMethod: "cash",
    amountPaid: 8000,
    change: 500,
  };
}

export function ReceiptPreview({
  localName,
  localAddress,
  localPhone,
  localLogo,
  localReceiptHeader,
  localReceiptFooter,
  localReceiptTagline,
  showLogo,
  logoPosition = "above",
  showPhone,
  showAddress,
  showBarcode,
  hidePoweredBy = false,
  paperSize,
}: ReceiptPreviewProps) {
  const isThermal = paperSize === "thermal";

  return (
    <div className="space-y-2">
      <Label>Live Preview — {isThermal ? "80mm roll" : "A4"}</Label>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-800">
        <div
          className={isThermal ? "mx-auto w-fit" : "w-[210mm]"}
          // zoom rather than transform: it shrinks the box the receipt
          // occupies, so the panel reserves no full-page height for it.
          style={{ zoom: isThermal ? 0.75 : 0.4 }}
        >
          <ReceiptView
            transaction={sampleTransaction()}
            paperSize={paperSize}
            profileOverride={{
              name: localName,
              address: localAddress,
              phone: localPhone,
              logo_url: localLogo,
              receipt_header: localReceiptHeader,
              receipt_footer: localReceiptFooter,
              receipt_tagline: localReceiptTagline,
              show_logo_on_receipt: showLogo ? 1 : 0,
              receipt_logo_position: logoPosition,
              show_phone_on_receipt: showPhone ? 1 : 0,
              show_address_on_receipt: showAddress ? 1 : 0,
              show_barcode_on_receipt: showBarcode ? 1 : 0,
              hide_powered_by: hidePoweredBy ? 1 : 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}
