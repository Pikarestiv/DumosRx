"use client";

import type { ReactNode } from "react";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { ProductViewModel } from "@/lib/types/product";
import { PODetailsSummaryBar } from "../po-details-summary-bar";
import { POItemBuilder } from "../po-item-builder";
import { POMobileSummaryDrawer } from "../po-mobile-summary-drawer";
import { getLineTotal } from "../po-line-item-math";
import type { POLineItemDraft } from "../po-item-ledger-table";
import { itemsChangeMode, type PoDraft, type RevertableField, type SaveMode } from "./po-draft-state";

interface PoOrderBodyProps {
  compact: boolean;
  banners: ReactNode;
  supplierName: string;
  draft: PoDraft;
  totalAmount: number;
  products: POProduct[];
  baseline: Map<string, POLineItemDraft>;
  readOnly: boolean;
  canEditProducts: boolean;
  newProductId: string | null;
  onNewProductConsumed: () => void;
  onOpenAddProduct: (seed: Partial<ProductViewModel>) => void;
  onOpenDetails: () => void;
  onChange: (update: (draft: PoDraft) => PoDraft, mode: SaveMode) => void;
  onRevert: (lineId: string, field: RevertableField) => void;
}

export function PoOrderBody(props: PoOrderBodyProps) {
  const { draft } = props;
  const onItemsChange = (items: POLineItemDraft[]) =>
    props.onChange((current) => ({ ...current, items }), itemsChangeMode(draft.items, items));

  return (
    <>
      <div
        className={props.compact ? "flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-3.5" : "flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-background/50"}
        style={props.compact ? { paddingBottom: "calc(7rem + var(--kb-inset, 0px) + var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))" } : undefined}
      >
        {props.banners}
        <PODetailsSummaryBar
          vendorName={props.supplierName}
          paymentStatus={draft.paymentStatus}
          dueDate={draft.dueDate}
          amountPaid={draft.amountPaid}
          onEdit={props.onOpenDetails}
        />
        <fieldset disabled={props.readOnly} className="contents">
          <POItemBuilder
            products={props.products}
            items={draft.items}
            onItemsChange={onItemsChange}
            onOpenAddProduct={props.onOpenAddProduct}
            newlyCreatedProductId={props.newProductId}
            onNewlyCreatedProductConsumed={props.onNewProductConsumed}
            canEditProducts={props.canEditProducts}
            baseline={props.baseline}
            onRevertField={props.onRevert}
          />
        </fieldset>
      </div>
      {props.compact && (
        <POMobileSummaryDrawer
          itemCount={draft.items.length}
          totalAmount={props.totalAmount}
          selectedSupplierName={props.supplierName}
          lineItems={draft.items.map((item) => ({
            productName: item.product_name,
            quantity: item.bulk_quantity,
            bulkUnit: item.bulk_unit,
            lineTotal: getLineTotal(item),
          }))}
        />
      )}
    </>
  );
}
