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
    expect(resolveAdjustmentDelta("receive_items", 5)).toBe(5);
    expect(resolveAdjustmentDelta("damage", 5)).toBe(-5);
    expect(resolveAdjustmentDelta("loss", 5)).toBe(-5);
  });

  it("lets an inventory count move stock either way", () => {
    expect(resolveAdjustmentDelta("inventory_count", 5)).toBe(5);
    expect(resolveAdjustmentDelta("inventory_count", -5)).toBe(-5);
  });

  it("previews stock after the adjustment without going negative", () => {
    expect(computeStockAfter(10, 5)).toBe(15);
    expect(computeStockAfter(10, -4)).toBe(6);
    expect(computeStockAfter(3, -8)).toBe(0);
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
