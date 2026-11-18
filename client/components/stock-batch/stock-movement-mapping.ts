import {
  STOCK_TRANSFER_NEEDS_REVIEW_STATUS,
  STOCK_TRANSFER_REVIEWED_STATUS,
} from "@/lib/db/queries/stock-transfers";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import { toUtcInstant } from "@/lib/utils/date-utils";
import {
  type StockMovement,
  resolveMovementDisplayType,
  formatPoReference,
} from "./stock-movement-utils";
import { parseAdjustmentReason } from "./adjustment-derivations";

export function mapMovement(m: StockMovementDbRow): StockMovement {
  const type = resolveMovementDisplayType(m);
  const isSettlement = type === "backorder_settlement";
  const parsed = parseAdjustmentReason(m.reason || "");
  const purchaseOrderId = isSettlement
    ? parsed.note || undefined
    : m.movement_type === "purchase"
      ? m.reference_id || undefined
      : undefined;

  const displayReason = isSettlement && purchaseOrderId
    ? `${parsed.reason || "Already sold before delivery"} (${formatPoReference(purchaseOrderId)})`
    : m.reason || "";

  return {
    id: m.id,
    date: toUtcInstant(m.created_at || m.movement_date || ""),
    product: m.product_name || "Unknown",
    type,
    quantity: m.quantity || 0,
    reason: displayReason,
    reference: m.reference_id || "",
    user: m.performed_by_name?.trim() || "System",
    supplier: m.supplier_name || undefined,
    batchNumber: m.batch_number || undefined,
    needsReview: m.status === STOCK_TRANSFER_NEEDS_REVIEW_STATUS,
    reviewed: m.status === STOCK_TRANSFER_REVIEWED_STATUS,
    purchaseOrderId,
  };
}
