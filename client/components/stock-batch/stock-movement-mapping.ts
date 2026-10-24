import {
  STOCK_TRANSFER_NEEDS_REVIEW_STATUS,
  STOCK_TRANSFER_REVIEWED_STATUS,
} from "@/lib/db/queries/stock-transfers";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import { type StockMovement, resolveMovementDisplayType } from "./stock-movement-utils";

export function mapMovement(m: StockMovementDbRow): StockMovement {
  return {
    id: m.id,
    date: m.created_at || m.movement_date || "",
    product: m.product_name || "Unknown",
    type: resolveMovementDisplayType(m),
    quantity: m.quantity || 0,
    reason: m.reason || "",
    reference: m.reference_id || "",
    user: m.performed_by_name?.trim() || "System",
    supplier: m.supplier_name || undefined,
    batchNumber: m.batch_number || undefined,
    needsReview: m.status === STOCK_TRANSFER_NEEDS_REVIEW_STATUS,
    reviewed: m.status === STOCK_TRANSFER_REVIEWED_STATUS,
  };
}
