"use client";

import { useRef, useState } from "react";
import { printNode } from "@/lib/utils/print-node";
import { useReceiptPaperSize } from "@/lib/hooks/use-receipt-paper-size";
import { ReceiptView, ReceiptTransaction } from "./receipt-view";

const THERMAL_PAGE_STYLE = `
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 0; background: #fff; }
`;

const A4_PAGE_STYLE = `
  @page { size: A4; margin: 15mm; }
  body { margin: 0; background: #fff; }
`;

/**
 * Renders the receipt off-screen (not display:none, that would carry over
 * into the printed clone and hide it there too) and prints it in isolation
 * via printNode, sized for whichever paper the device is set to.
 */
export function usePrintReceipt() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transaction, setTransaction] = useState<ReceiptTransaction | null>(
    null,
  );
  const { paperSize } = useReceiptPaperSize();

  const print = (txn: ReceiptTransaction) => {
    setTransaction(txn);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          printNode(
            containerRef.current,
            paperSize === "thermal" ? THERMAL_PAGE_STYLE : A4_PAGE_STYLE,
          );
        }
      });
    });
  };

  const portal = (
    <div
      aria-hidden="true"
      style={{ position: "fixed", left: -9999, top: -9999 }}
    >
      <div ref={containerRef}>
        {transaction && (
          <ReceiptView transaction={transaction} paperSize={paperSize} />
        )}
      </div>
    </div>
  );

  return { print, portal, paperSize };
}
