import { describe, it, expect } from "vitest";
import {
  resolveMovementDisplayType,
  getTypeLabel,
} from "@/components/stock-batch/stock-movement-utils";
import { groupAdjustmentMovements } from "@/components/stock-batch/adjustment-derivations";
import {
  ADJUSTMENT_REASON_NOTE_SEPARATOR,
  BACKORDER_REASON,
  BACKORDER_REFERENCE_TYPE,
  BACKORDER_SETTLEMENT_REASON,
  BACKORDER_SETTLEMENT_REFERENCE_TYPE,
  STOCK_LOSS_REASON_LABELS,
} from "@/lib/constants/stock-adjustments";
import { describeOwedSettlement } from "@/lib/utils/stock-status";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";

const row = (referenceType: string, quantity: number, reason: string) =>
  ({
    id: `m-${referenceType}-${quantity}`, product_id: "p1", stock_batch_id: "b1", movement_type: "adjustment",
    quantity, reference_type: referenceType, reference_id: "ref-1", reason, movement_date: "2026-10-26T10:00:00Z",
  }) as unknown as StockMovementDbRow;

describe("readers of owed and settled rows", () => {
  it("labels both rows in the stock movements list", () => {
    const owed = resolveMovementDisplayType({ movement_type: "adjustment", reference_type: BACKORDER_REFERENCE_TYPE });
    const settled = resolveMovementDisplayType({ movement_type: "adjustment", reference_type: BACKORDER_SETTLEMENT_REFERENCE_TYPE });
    expect(getTypeLabel(owed)).toBe("Stock owed");
    expect(getTypeLabel(settled)).toBe("Stock settled");
  });

  it("keeps both out of the count ledger's grouping, the way imports are kept out", () => {
    const groups = groupAdjustmentMovements([
      row(BACKORDER_REFERENCE_TYPE, 2, BACKORDER_REASON),
      row(BACKORDER_SETTLEMENT_REFERENCE_TYPE, -2, BACKORDER_SETTLEMENT_REASON),
    ]);
    expect(groups).toEqual([]);
  });

  it("never matches a stock-loss reason, so losses never count them", () => {
    for (const reason of [BACKORDER_REASON, BACKORDER_SETTLEMENT_REASON]) {
      for (const label of STOCK_LOSS_REASON_LABELS) {
        expect(reason).not.toBe(label);
        expect(reason.startsWith(`${label}${ADJUSTMENT_REASON_NOTE_SEPARATOR}`)).toBe(false);
      }
    }
  });

  it("words the receive notice with and without quantities", () => {
    expect(describeOwedSettlement(5, 20, true)).toBe("5 already sold before this delivery. 15 will go on the shelf.");
    expect(describeOwedSettlement(5, 3, true)).toBe("5 already sold before this delivery. All 3 go to those sales; none go on the shelf.");
    expect(describeOwedSettlement(5, 20, false)).toBe("Some of this was already sold before the delivery and is taken off what goes on the shelf.");
  });
});
