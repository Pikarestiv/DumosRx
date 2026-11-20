import { describe, it, expect } from "vitest";
import { describeAuditDetails } from "@/components/products/product-details/product-audit-description";

const created = (fields: Record<string, unknown>) => describeAuditDetails("INSERT", JSON.stringify(fields), true);

describe("product audit description", () => {
  it("leaves out fields that were never filled in when a product is created", () => {
    const text = created({ name: "cetaphil", generic_name: null, strength: "", selling_price: 29000, barcode: null });
    expect(text).toBe("Created with: Name: cetaphil • Selling price: 29000");
  });

  it("shows a units-per-bulk figure as a number, not Yes/No", () => {
    expect(created({ name: "Soap", units_per_bulk: 1 })).toContain("Units per bulk: 1");
    expect(created({ name: "Soap", units_per_bulk: 12 })).toContain("Units per bulk: 12");
  });

  it("shows true/false flags as Yes/No", () => {
    const text = created({ name: "Soap", is_active: 1, requires_prescription: 0, show_online: true });
    expect(text).toContain("Active: Yes");
    expect(text).toContain("Requires prescription: No");
    expect(text).toContain("Show online: Yes");
  });

  it("keeps a cleared field on an update, so the change is visible", () => {
    expect(describeAuditDetails("UPDATE", JSON.stringify({ barcode: "" }), true)).toBe("Changed: Barcode: -");
  });

  it("hides bookkeeping columns", () => {
    expect(created({ id: "x", store_id: "s", _version: 2, created_at: "t", name: "Soap" })).toBe("Created with: Name: Soap");
  });

  it("falls back to a plain sentence when nothing readable is left", () => {
    expect(created({ id: "x", barcode: null })).toBe("Product created.");
    expect(describeAuditDetails("UPDATE", JSON.stringify({ _version: 3 }), true)).toBe("Details updated.");
  });

  it("returns unparseable details as they are and reports missing ones", () => {
    expect(describeAuditDetails("UPDATE", "not json", true)).toBe("not json");
    expect(describeAuditDetails("UPDATE", null, true)).toBe("No details provided");
  });

  it("hides the old and new cost of a corrected batch from a user who may not view cost", () => {
    const details = JSON.stringify({ batch_number: "B1", previous_cost_price: 800, cost_price: 700, reason: "typo_at_receiving" });
    const hidden = describeAuditDetails("batch_cost_corrected", details, false);
    expect(hidden).toContain("cost price corrected");
    expect(hidden).not.toMatch(/800|700/);
    expect(describeAuditDetails("batch_cost_corrected", details, true)).toMatch(/800 → 700/);
  });
});
