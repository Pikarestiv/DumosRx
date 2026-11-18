"use client";

import { useState } from "react";
import { POBackButton } from "./po-back-button";
import { PODetailsSummaryBar } from "./po-details-summary-bar";
import { POItemBuilder } from "./po-item-builder";
import { POImmediateConfirmDialog } from "./po-immediate-confirm-dialog";
import { POCreateActions } from "./po-create-actions";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import type { POCreateViewProps } from "./po-create-view-props";

// Desktop full-screen takeover for creating a purchase order, same as the Cycle Count session in stock-batch/stock-audits.…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-desktop-create-view-tsx-L56
export function PODesktopCreateView(props: POCreateViewProps) {
  const formatCurrency = useFormatCurrency();
  const { items, totalAmount, products, isWalkIn } = props;
  const [isConfirmReceiveOpen, setIsConfirmReceiveOpen] = useState(false);

  return (
    <div className="flex fixed inset-0 z-50 flex-col bg-background">
      <div
        className="flex items-center gap-3 px-6 pb-5 border-b border-border bg-card shrink-0"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1.25rem)" }}
      >
        <POBackButton itemCount={items.length} />
        <div>
          <div className="text-[17px] font-serif font-bold leading-tight">
            Create Purchase Order
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {isWalkIn ? "Record stock bought at the counter" : "Build an order for your vendor"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
              Estimated total
            </div>
            <div className="text-[15px] font-bold font-serif text-primary leading-tight">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <POCreateActions
            isWalkIn={isWalkIn}
            canReceive={props.canReceive}
            isSubmitting={props.isSubmitting}
            hasItems={items.length > 0}
            onSaveDraft={props.handleSaveDraft}
            onReceive={() => setIsConfirmReceiveOpen(true)}
            onSend={props.handleSend}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-background/50">
        <PODetailsSummaryBar
          vendorName={props.selectedSupplierName}
          paymentStatus={props.paymentStatus}
          dueDate={props.dueDate}
          amountPaid={props.amountPaid}
          onEdit={() => props.setIsEditDetailsOpen(true)}
        />
        <POItemBuilder
          poType="immediate"
          products={products}
          items={items}
          onItemsChange={props.onItemsChange}
          onOpenAddProduct={props.onOpenAddProduct}
          newlyCreatedProductId={props.newlyCreatedProductId}
          onNewlyCreatedProductConsumed={props.onNewlyCreatedProductConsumed}
          canEditProducts={props.canEditProducts}
        />
      </div>

      <POImmediateConfirmDialog
        open={isConfirmReceiveOpen}
        onOpenChange={setIsConfirmReceiveOpen}
        items={items}
        products={products}
        totalAmount={totalAmount}
        onConfirm={props.handleReceive}
      />
    </div>
  );
}
