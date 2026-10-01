import { describe, it, expect } from "vitest";
import { resolveMovementDisplayType, FILTER_TYPES } from "@/components/stock-batch/stock-movement-utils";

/**
 * A bulk-import stock correction for an existing product is written with
 * movement_type "adjustment" (same audit machinery as a manual cycle count),
 * so the general Stock Movements table - which reads movement_type directly -
 * showed it as an ordinary "Adjustment" with no way to tell the two apart.
 * The Adjustments Ledger already solves this via reference_type/reason (see
 * groupAdjustmentMovements); resolveMovementDisplayType does the same for
 * this table.
 */
describe("resolveMovementDisplayType", () => {
  it("labels a current-shape bulk-import correction as import, not adjustment", () => {
    const row = { movement_type: "adjustment", reference_type: "import", reason: "Bulk import stock update" };
    expect(resolveMovementDisplayType(row)).toBe("import");
  });

  it("labels a legacy-shape bulk-import correction as import via the reason prefix", () => {
    const row = { movement_type: "adjustment", reference_type: "stock_audit", reason: "Bulk import stock update" };
    expect(resolveMovementDisplayType(row)).toBe("import");
  });

  it("still detects the legacy reason when it carries a trailing note", () => {
    const row = {
      movement_type: "adjustment",
      reference_type: "stock_audit",
      reason: "Bulk import stock update — 3 items skipped",
    };
    expect(resolveMovementDisplayType(row)).toBe("import");
  });

  it("leaves a genuine manual adjustment as adjustment", () => {
    const row = { movement_type: "adjustment", reference_type: "stock_audit", reason: "Cycle count correction" };
    expect(resolveMovementDisplayType(row)).toBe("adjustment");
  });

  it("leaves every non-adjustment movement type untouched", () => {
    expect(resolveMovementDisplayType({ movement_type: "sale", reference_type: "sale", reason: "" })).toBe("sale");
    expect(resolveMovementDisplayType({ movement_type: "purchase", reference_type: "import", reason: "" })).toBe(
      "purchase",
    );
  });

  it("defaults a missing movement_type to adjustment, same as the raw-column fallback it replaces", () => {
    const row = { movement_type: null, reference_type: null, reason: "" } as unknown as {
      movement_type: string;
      reference_type: string;
      reason: string;
    };
    expect(resolveMovementDisplayType(row)).toBe("adjustment");
  });

  it("registers a dedicated filter option so the type is reachable from the Type dropdown", () => {
    expect(FILTER_TYPES.some((f) => f.id === "import")).toBe(true);
  });
});
