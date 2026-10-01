import { describe, it, expect } from "vitest";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REFERENCE_TYPE,
  AUDIT_REFERENCE_TYPE,
  buildAdjustmentReason,
  computeStockAfter,
  filterAdjustmentGroups,
  groupAdjustmentMovements,
  parseAdjustmentReason,
  resolveAdjustmentDelta,
} from "@/components/stock-batch/adjustment-derivations";
import {
  LEGACY_PRODUCT_IMPORT_REASON,
  PRODUCT_IMPORT_REFERENCE_TYPE,
  STOCK_LOSS_REASON_LABELS,
} from "@/lib/constants/stock-adjustments";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";

function row(over: Partial<StockMovementDbRow> & { id: string }): StockMovementDbRow {
  return {
    product_id: "p1",
    movement_type: "adjustment",
    quantity: -1,
    movement_date: "2026-09-20T10:00:00.000Z",
    ...over,
  } as StockMovementDbRow;
}

describe("adjustment ledger grouping", () => {
  it("collapses every movement sharing a reference_id into one adjustment", () => {
    const groups = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "ADJ-1", product_id: "p1", product_name: "Paracetamol", quantity: -3 }),
      row({ id: "m2", reference_id: "ADJ-1", product_id: "p2", product_name: "Amoxil", quantity: -2 }),
      row({ id: "m3", reference_id: "ADJ-1", product_id: "p2", product_name: "Amoxil", quantity: -1 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].referenceId).toBe("ADJ-1");
    expect(groups[0].itemCount).toBe(2);
    expect(groups[0].netQuantity).toBe(-6);
    expect(groups[0].products).toEqual(["Amoxil", "Paracetamol"]);
  });

  it("distinguishes quick adjustments from cycle-count audits by reference_type", () => {
    const groups = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "ADJ-1", reference_type: ADJUSTMENT_REFERENCE_TYPE }),
      row({ id: "m2", reference_id: "AUD-1", reference_type: AUDIT_REFERENCE_TYPE }),
    ]);

    expect(groups.map((g) => g.source).sort()).toEqual([
      ADJUSTMENT_REFERENCE_TYPE,
      AUDIT_REFERENCE_TYPE,
    ]);
  });

  it("excludes a bulk-import stock correction, unlike a genuine cycle-count audit", () => {
    const groups = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "IMPORT-1", reference_type: PRODUCT_IMPORT_REFERENCE_TYPE }),
      row({ id: "m2", reference_id: "AUD-1", reference_type: AUDIT_REFERENCE_TYPE }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].referenceId).toBe("AUD-1");
  });

  it("excludes a legacy bulk-import row still tagged stock_audit, from before the reference_type fix", () => {
    const groups = groupAdjustmentMovements([
      row({
        id: "m1",
        reference_id: "AUD-LEGACY",
        reference_type: AUDIT_REFERENCE_TYPE,
        reason: LEGACY_PRODUCT_IMPORT_REASON,
      }),
      row({ id: "m2", reference_id: "AUD-1", reference_type: AUDIT_REFERENCE_TYPE }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].referenceId).toBe("AUD-1");
  });

  it("keeps a movement with no reference_id as its own row rather than merging them all", () => {
    const groups = groupAdjustmentMovements([
      row({ id: "m1", quantity: -1 }),
      row({ id: "m2", quantity: -4 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.netQuantity).sort((a, b) => a - b)).toEqual([-4, -1]);
  });

  it("ignores movements that are not adjustments", () => {
    const groups = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "SALE-1", movement_type: "sale" }),
      row({ id: "m2", reference_id: "PO-1", movement_type: "purchase" }),
      row({ id: "m3", reference_id: "ADJ-1" }),
    ]);

    expect(groups.map((g) => g.referenceId)).toEqual(["ADJ-1"]);
  });

  it("dates the adjustment from its most recent movement and sorts newest first", () => {
    const groups = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "ADJ-OLD", movement_date: "2026-09-01T09:00:00.000Z" }),
      row({ id: "m2", reference_id: "ADJ-NEW", movement_date: "2026-09-05T09:00:00.000Z" }),
      row({ id: "m3", reference_id: "ADJ-NEW", movement_date: "2026-09-07T09:00:00.000Z" }),
    ]);

    expect(groups.map((g) => g.referenceId)).toEqual(["ADJ-NEW", "ADJ-OLD"]);
    expect(groups[0].date).toBe("2026-09-07T09:00:00.000Z");
  });

  it("carries both ends of a group's movement date interval", () => {
    const [group] = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "ADJ-1", movement_date: "2026-09-05T23:58:00.000Z" }),
      row({ id: "m2", reference_id: "ADJ-1", movement_date: "2026-09-06T00:01:00.000Z" }),
      row({ id: "m3", reference_id: "ADJ-1", movement_date: "2026-09-05T23:59:00.000Z" }),
    ]);

    expect(group.startDate).toBe("2026-09-05T23:58:00.000Z");
    expect(group.endDate).toBe("2026-09-06T00:01:00.000Z");
    expect(group.date).toBe(group.endDate);
  });

  it("surfaces the fixed reason and its optional note separately", () => {
    const [group] = groupAdjustmentMovements([
      row({ id: "m1", reference_id: "ADJ-1", reason: buildAdjustmentReason("damage", "Water leak in store room") }),
    ]);

    expect(group.reason).toBe("Damage");
    expect(group.note).toBe("Water leak in store room");
  });
});

describe("adjustment ledger filtering", () => {
  const groups = groupAdjustmentMovements([
    row({
      id: "m1",
      reference_id: "ADJ-1",
      product_name: "Paracetamol",
      reason: buildAdjustmentReason("damage"),
      movement_date: "2026-09-02T10:00:00.000Z",
    }),
    row({
      id: "m2",
      reference_id: "ADJ-2",
      product_name: "Amoxil",
      reason: buildAdjustmentReason("loss"),
      movement_date: "2026-09-20T10:00:00.000Z",
    }),
  ]);

  it("searches by adjustment reference id", () => {
    expect(filterAdjustmentGroups(groups, { search: "adj-2" }).map((g) => g.referenceId)).toEqual([
      "ADJ-2",
    ]);
  });

  it("searches by the name of a product the adjustment touched", () => {
    expect(filterAdjustmentGroups(groups, { search: "paracet" }).map((g) => g.referenceId)).toEqual([
      "ADJ-1",
    ]);
  });

  it("filters by reason", () => {
    expect(filterAdjustmentGroups(groups, { reason: "loss" }).map((g) => g.referenceId)).toEqual([
      "ADJ-2",
    ]);
  });

  it("filters by an inclusive date range", () => {
    expect(
      filterAdjustmentGroups(groups, { from: "2026-09-02", to: "2026-09-02" }).map(
        (g) => g.referenceId,
      ),
    ).toEqual(["ADJ-1"]);
  });

  it("returns everything when no filter is applied", () => {
    expect(filterAdjustmentGroups(groups, {})).toHaveLength(2);
  });

  describe("a group whose movements straddle midnight", () => {
    const spanning = groupAdjustmentMovements([
      row({
        id: "m1",
        reference_id: "ADJ-MIDNIGHT",
        reason: buildAdjustmentReason("inventory_count"),
        movement_date: "2026-09-10T23:55:00.000Z",
      }),
      row({
        id: "m2",
        reference_id: "ADJ-MIDNIGHT",
        reason: buildAdjustmentReason("inventory_count"),
        movement_date: "2026-09-11T00:04:00.000Z",
      }),
    ]);

    it("matches a range ending on the day it started", () => {
      expect(
        filterAdjustmentGroups(spanning, { from: "2026-09-10", to: "2026-09-10" }).map(
          (g) => g.referenceId,
        ),
      ).toEqual(["ADJ-MIDNIGHT"]);
    });

    it("matches a range starting on the day it finished", () => {
      expect(
        filterAdjustmentGroups(spanning, { from: "2026-09-11", to: "2026-09-11" }).map(
          (g) => g.referenceId,
        ),
      ).toEqual(["ADJ-MIDNIGHT"]);
    });

    it("stays out of a range that touches neither of its days", () => {
      expect(filterAdjustmentGroups(spanning, { from: "2026-09-12", to: "2026-09-20" })).toEqual([]);
      expect(filterAdjustmentGroups(spanning, { from: "2026-09-01", to: "2026-09-09" })).toEqual([]);
    });
  });
});

describe("adjustment quantity maths", () => {
  it("offers exactly the four supported reasons", () => {
    expect(ADJUSTMENT_REASONS.map((r) => r.label)).toEqual([
      "Receive items",
      "Damage",
      "Inventory count",
      "Loss",
    ]);
  });

  it("signs the entered quantity from the reason's direction", () => {
    expect(resolveAdjustmentDelta("receive_items", 5, 8)).toBe(5);
    expect(resolveAdjustmentDelta("damage", 5, 8)).toBe(-5);
    expect(resolveAdjustmentDelta("loss", 5, 8)).toBe(-5);
  });

  it("reads an inventory count as the counted quantity, not a delta to add", () => {
    expect(resolveAdjustmentDelta("inventory_count", 12, 8)).toBe(4);
    expect(resolveAdjustmentDelta("inventory_count", 8, 8)).toBe(0);
  });

  it("makes an inventory count below the system quantity a removal", () => {
    expect(resolveAdjustmentDelta("inventory_count", 5, 8)).toBe(-3);
    expect(resolveAdjustmentDelta("inventory_count", 0, 8)).toBe(-8);
  });

  it("previews stock after the adjustment without going negative", () => {
    expect(computeStockAfter(10, 5)).toBe(15);
    expect(computeStockAfter(10, -4)).toBe(6);
    expect(computeStockAfter(3, -8)).toBe(0);
  });

  it("previews an inventory count as exactly the counted quantity", () => {
    expect(computeStockAfter(8, resolveAdjustmentDelta("inventory_count", 5, 8))).toBe(5);
    expect(computeStockAfter(8, resolveAdjustmentDelta("inventory_count", 13, 8))).toBe(13);
  });

  it("round-trips a reason with and without a note", () => {
    expect(parseAdjustmentReason(buildAdjustmentReason("loss"))).toEqual({
      reason: "Loss",
      note: "",
    });
    expect(parseAdjustmentReason(buildAdjustmentReason("loss", "Expired batch"))).toEqual({
      reason: "Loss",
      note: "Expired batch",
    });
  });

  it("passes a legacy cycle-count reason through untouched", () => {
    expect(parseAdjustmentReason("Cycle count adjustment")).toEqual({
      reason: "Cycle count adjustment",
      note: "",
    });
  });
});

describe("STOCK_LOSS_REASON_LABELS", () => {
  it("stays in step with every decrease-direction ADJUSTMENT_REASONS label", () => {
    const decreaseLabels = ADJUSTMENT_REASONS.filter(
      (reason) => reason.direction === "decrease",
    ).map((reason) => reason.label);

    expect([...STOCK_LOSS_REASON_LABELS].sort()).toEqual(decreaseLabels.sort());
  });

  it("matches what buildAdjustmentReason actually persists", () => {
    for (const label of STOCK_LOSS_REASON_LABELS) {
      const reason = ADJUSTMENT_REASONS.find((entry) => entry.label === label);
      expect(reason).toBeDefined();
      expect(buildAdjustmentReason(reason!.value)).toBe(label);
    }
  });
});
