import { describe, it, expect } from "vitest";
import {
  changedFields,
  itemsChangeMode,
  recordUndo,
  revertField,
  takeUndo,
  UNDO_LIMIT,
  type PoDraft,
} from "@/components/procurement/order-screen/po-draft-state";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";

const line = (overrides: Partial<POLineItemDraft> = {}): POLineItemDraft => ({
  id: "l1", product_id: "p1", product_name: "Panadol", bulk_unit: "Carton",
  bulk_quantity: 2, units_per_bulk: 10, unit_cost: 100, subtotal: 200, ...overrides,
});
const draft = (notes: string): PoDraft => ({
  supplierId: "__self__", notes, items: [], paidInFull: true, amountPaid: "", dueDate: "", paymentTouched: false,
});

describe("session undo history", () => {
  it("groups a burst of typing into one undo step but keeps a row add as its own", () => {
    let history = { stack: [] as PoDraft[], lastPushAt: 0 };
    history = recordUndo(history, draft("a"), 1000, "debounced");
    history = recordUndo(history, draft("ab"), 1400, "debounced");
    history = recordUndo(history, draft("abc"), 1600, "now");
    expect(history.stack.map((d) => d.notes)).toEqual(["a", "abc"]);
  });

  it("starts a new step once typing pauses", () => {
    let history = { stack: [] as PoDraft[], lastPushAt: 0 };
    history = recordUndo(history, draft("a"), 1000, "debounced");
    history = recordUndo(history, draft("ab"), 2500, "debounced");
    expect(history.stack).toHaveLength(2);
  });

  it("undoes the most recent step and returns nothing once empty", () => {
    const history = recordUndo({ stack: [], lastPushAt: 0 }, draft("before"), 1000, "now");
    const first = takeUndo(history);
    expect(first.draft?.notes).toBe("before");
    expect(takeUndo(first.history).draft).toBeNull();
  });

  it("keeps only the most recent steps", () => {
    let history = { stack: [] as PoDraft[], lastPushAt: 0 };
    for (let i = 0; i < UNDO_LIMIT + 5; i++) history = recordUndo(history, draft(String(i)), i * 5000, "now");
    expect(history.stack).toHaveLength(UNDO_LIMIT);
    expect(history.stack[0].notes).toBe("5");
  });
});

describe("autosave timing for line edits", () => {
  it("saves at once when a row is added or removed, and after a pause for an edit in place", () => {
    expect(itemsChangeMode([line()], [line(), line({ id: "l2" })])).toBe("now");
    expect(itemsChangeMode([line()], [])).toBe("now");
    expect(itemsChangeMode([line()], [line({ bulk_quantity: 3 })])).toBe("debounced");
  });
});

describe("changes against the order as opened", () => {
  it("names the fields that differ from the opened order, treating blank and null alike", () => {
    const opened = line({ lot_number: undefined, cost_price_override: 4 });
    expect(changedFields(line({ lot_number: "", cost_price_override: 4 }), opened)).toEqual([]);
    expect(changedFields(line({ bulk_quantity: 5, lot_number: "L2", cost_price_override: 4 }), opened)).toEqual(["bulk_quantity", "lot_number"]);
  });

  it("reports nothing for a row added in this session", () => {
    expect(changedFields(line({ bulk_quantity: 9 }), undefined)).toEqual([]);
  });

  it("reverts one field of one row and leaves the rest of the edit", () => {
    const opened = line();
    const edited = [line({ bulk_quantity: 7, lot_number: "NEW" }), line({ id: "l2", bulk_quantity: 1 })];
    const reverted = revertField(edited, "l1", "bulk_quantity", opened);
    expect(reverted[0]).toMatchObject({ bulk_quantity: 2, lot_number: "NEW" });
    expect(reverted[1].bulk_quantity).toBe(1);
  });
});
