"use client";

import { useState } from "react";
import { POBackButton } from "./po-back-button";
import { POImmediateConfirmDialog } from "./po-immediate-confirm-dialog";
import { PODetailsSummaryBar } from "./po-details-summary-bar";
import { POItemBuilder } from "./po-item-builder";
import { POMobileSummaryDrawer } from "./po-mobile-summary-drawer";
import { POCreateActions } from "./po-create-actions";
import { getLineTotal } from "./po-line-item-math";
import type { POCreateViewProps } from "./po-create-view-props";

// Mobile full-screen takeover for creating a purchase order.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-mobile-create-view-tsx-L57
export function POMobileCreateView(props: POCreateViewProps) {
  const { items, totalAmount, products, isWalkIn } = props;
  const [isConfirmReceiveOpen, setIsConfirmReceiveOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-40 bg-background flex flex-col fixed-visual-viewport"
    >
      <div
        className="flex items-center gap-3 px-4 border-b border-border bg-card shrink-0"
        style={{
          paddingTop:
            "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1.25rem)",
          paddingBottom: "0.75rem",
        }}
      >
        <POBackButton itemCount={items.length} />
        <div className="min-w-0">
          <div className="text-[15px] font-serif font-bold leading-tight">
            Create Purchase Order
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {`Draft · ${items.length} ${items.length === 1 ? "item" : "items"}`}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <POCreateActions
            compact
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

      <div
        className="flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-3.5"
        style={{
          paddingBottom:
            "calc(7rem + var(--kb-inset, 0px) + var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <div className="[[data-keyboard-open]_&]:hidden">
          <PODetailsSummaryBar
            vendorName={props.selectedSupplierName}
            paymentStatus={props.paymentStatus}
            dueDate={props.dueDate}
            amountPaid={props.amountPaid}
            onEdit={() => props.setIsEditDetailsOpen(true)}
          />
        </div>
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

      <POMobileSummaryDrawer
        itemCount={items.length}
        totalAmount={totalAmount}
        selectedSupplierName={props.selectedSupplierName}
        lineItems={items.map((item) => ({
          productName: item.product_name,
          quantity: item.bulk_quantity,
          bulkUnit: item.bulk_unit,
          lineTotal: getLineTotal(item, "immediate"),
        }))}
      />

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
