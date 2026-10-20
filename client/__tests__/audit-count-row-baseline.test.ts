import { describe, it, expect } from "vitest";
import {
  applyCountBaseline,
  applyOptimisticCount,
  createCountSequencer,
  toStockAuditSubmissions,
} from "@/components/stock-batch/audit-derivations";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

function sheet(): AuditItem[] {
  return [
    {
      id: "p1",
      name: "Panadol",
      sku: "SKU-1",
      category: "Analgesics",
      // What the sheet opened with, hours ago.
      systemQty: 10,
    },
    { id: "p2", name: "Flagyl", sku: "SKU-2", category: "Antibiotics", systemQty: 4 },
  ];
}

// A-263. The two state transitions behind countRow(), tested directly rather than through a copy of them:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-audit-count-row-baseline-test-ts-L24
describe("counting a row re-baselines it against live stock", () => {
  it("shows the typed figure before the read resolves, so typing never waits on the database", () => {
    const [row] = applyOptimisticCount(sheet(), "p1", 7);
    expect(row.countedQty).toBe(7);
    expect(row.counted).toBe(true);
    // Not yet a baseline: nothing has been re-read.
    expect(row.baselineQty).toBeUndefined();
    expect(row.systemQty).toBe(10);
  });

  it("stamps the live figure as the baseline once the read lands", () => {
    const [row] = applyCountBaseline(sheet(), "p1", 7, 3);
    expect(row.countedQty).toBe(7);
    expect(row.systemQty).toBe(3);
    expect(row.baselineQty).toBe(3);
    expect(row.counted).toBe(true);
  });

  it("records the live figure on both sides for a tick, so it posts nothing", () => {
    const [row] = applyCountBaseline(sheet(), "p1", undefined, 4);
    expect(row.countedQty).toBe(4);
    expect(row.baselineQty).toBe(4);
  });

  it("touches only the row being counted", () => {
    const [, other] = applyCountBaseline(sheet(), "p1", 7, 3);
    expect(other).toEqual(sheet()[1]);
  });

  it("is a no-op against a sheet that has been cleared", () => {
    expect(applyCountBaseline([], "p1", 7, 3)).toEqual([]);
    expect(applyOptimisticCount([], "p1", 7)).toEqual([]);
  });

  it("submits the stamped baseline, and none at all before one exists", () => {
    const counted = applyCountBaseline(sheet(), "p1", 7, 3);
    expect(toStockAuditSubmissions([counted[0]])[0].baselineQty).toBe(3);

    const optimisticOnly = applyOptimisticCount(sheet(), "p1", 7);
    expect(toStockAuditSubmissions([optimisticOnly[0]])[0].baselineQty).toBeUndefined();
  });
});

// The guard that makes counting last-TYPED-wins rather than last-READ-wins.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-audit-count-row-baseline-test-ts-L72
describe("createCountSequencer", () => {
  it("keeps the newest count and drops an earlier read that lands late", () => {
    const seq = createCountSequencer();
    const first = seq.begin("p1");
    const second = seq.begin("p1");

    expect(seq.isCurrent("p1", second)).toBe(true);
    expect(seq.isCurrent("p1", first)).toBe(false);
  });

  it("tracks rows independently", () => {
    const seq = createCountSequencer();
    const a = seq.begin("p1");
    seq.begin("p2");
    expect(seq.isCurrent("p1", a)).toBe(true);
  });

  it("cancels one row's in-flight read, so clearing it cannot be undone by a late landing", () => {
    const seq = createCountSequencer();
    const token = seq.begin("p1");
    seq.cancel("p1");
    expect(seq.isCurrent("p1", token)).toBe(false);
  });

  it("cancels every row, so Start over cannot be undone by a late landing", () => {
    const seq = createCountSequencer();
    const a = seq.begin("p1");
    const b = seq.begin("p2");
    seq.cancel();
    expect(seq.isCurrent("p1", a)).toBe(false);
    expect(seq.isCurrent("p2", b)).toBe(false);
  });
});
