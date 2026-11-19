import { describe, it, expect } from "vitest";
import {
  averageCostTerms,
  batchesSellingBefore,
  fefoSellOrder,
  lastReceivedBatch,
  previewBatchCostChange,
  unusualCostWarning,
} from "@/lib/utils/batch-cost-breakdown";
import type { StockBatch } from "@/lib/types/stock-batch";

const TODAY = "2026-11-18";
const b = (id: string, quantity: number, cost: number | undefined, extra: Partial<StockBatch> = {}): StockBatch => ({
  id, product_id: "p1", batch_number: id.toUpperCase(), quantity, cost_price: cost, is_active: 1,
  created_at: "2026-01-01T00:00:00.000Z", ...extra,
});

describe("fefoSellOrder", () => {
  it("sells the earliest expiry first, undated batches (NULL or '') last, then the oldest receipt", () => {
    const order = fefoSellOrder([
      b("blank", 5, 100, { expiry_date: "", created_at: "2025-01-01T00:00:00.000Z" }),
      b("late", 5, 100, { expiry_date: "2027-06-01" }),
      b("none", 5, 100, { created_at: "2024-01-01T00:00:00.000Z" }),
      b("soon", 5, 100, { expiry_date: "2027-01-01" }),
    ], TODAY);

    expect(order.map((x) => x.id)).toEqual(["soon", "late", "none", "blank"]);
  });

  it("leaves out sold-out, inactive and expired batches, including one expiring today", () => {
    const order = fefoSellOrder([
      b("sold-out", 0, 100, { expiry_date: "2027-01-01" }),
      b("inactive", 5, 100, { expiry_date: "2027-01-01", is_active: 0 }),
      b("today", 5, 100, { expiry_date: TODAY }),
      b("ok", 5, 100, { expiry_date: "2027-02-01" }),
    ], TODAY);

    expect(order.map((x) => x.id)).toEqual(["ok"]);
  });

  it("names the batches that will sell before the edited one, and none for the first or a sold-out one", () => {
    const batches = [b("first", 3, 900, { expiry_date: "2027-01-01" }), b("edited", 10, 650, { expiry_date: "2027-09-01" }), b("gone", 0, 500)];

    expect(batchesSellingBefore(batches, "edited", TODAY).map((x) => x.id)).toEqual(["first"]);
    expect(batchesSellingBefore(batches, "first", TODAY)).toEqual([]);
    expect(batchesSellingBefore(batches, "gone", TODAY)).toEqual([]);
  });
});

describe("averageCostTerms", () => {
  it("explains the average as units at each cost over the units held, ignoring sold-out batches", () => {
    const { terms, units, average } = averageCostTerms([b("a", 13, 650), b("b", 2, 800), b("c", 0, 5000)]);

    expect(terms).toEqual([{ units: 13, cost: 650 }, { units: 2, cost: 800 }]);
    expect(units).toBe(15);
    expect(average).toBeCloseTo((13 * 650 + 2 * 800) / 15, 10);
  });

  it("counts a batch with no cost as 0, like the catalog's SQL average, and has no average with nothing in stock", () => {
    expect(averageCostTerms([b("a", 1, undefined), b("b", 1, 100)]).average).toBe(50);
    expect(averageCostTerms([b("a", 0, 100)]).average).toBeNull();
    expect(averageCostTerms([]).average).toBeNull();
  });
});

describe("previewBatchCostChange", () => {
  const batches = [b("a", 13, 6500), b("b", 2, 800), b("sold", 0, 700)];

  it("shows the batch, the average, the stock value and the profit per unit before and after", () => {
    const preview = previewBatchCostChange(batches, "a", 650, 1000);

    expect(preview.batchCost).toEqual({ from: 6500, to: 650 });
    expect(preview.average).toEqual({ from: 5740, to: 670 });
    expect(preview.stockValue).toEqual({ from: 13 * 6500 + 1600, to: 13 * 650 + 1600 });
    expect(preview.profitPerUnit).toEqual({ from: -5500, to: 350 });
  });

  it("leaves the stock value and average alone when a sold-out batch is corrected", () => {
    const preview = previewBatchCostChange(batches, "sold", 70, 1000);

    expect(preview.stockValue.from).toBe(preview.stockValue.to);
    expect(preview.average?.from).toBe(preview.average?.to);
    expect(preview.batchCost).toEqual({ from: 700, to: 70 });
  });

  it("rounds the new cost to the kobo and gives no profit line without a selling price", () => {
    const preview = previewBatchCostChange(batches, "b", 799.999, 0);

    expect(preview.batchCost.to).toBe(800);
    expect(preview.profitPerUnit).toBeNull();
  });
});

describe("unusualCostWarning", () => {
  const batches = [b("a", 5, 650), b("b", 5, 700), b("c", 0, 600), b("edited", 5, 680)];

  it("warns on a zero cost", () => {
    expect(unusualCostWarning(batches, "edited", 0)).toEqual({ kind: "zero" });
  });

  it("catches an extra zero or a missing one against the product's other batches", () => {
    expect(unusualCostWarning(batches, "edited", 6800)).toEqual({ kind: "far", reference: 650 });
    expect(unusualCostWarning(batches, "edited", 68)).toEqual({ kind: "far", reference: 650 });
  });

  it("stays quiet for a plausible cost, a lone batch, or a value that is not a number", () => {
    expect(unusualCostWarning(batches, "edited", 900)).toBeNull();
    expect(unusualCostWarning([b("edited", 5, 6500)], "edited", 650)).toBeNull();
    expect(unusualCostWarning(batches, "edited", Number.NaN)).toBeNull();
  });
});

describe("lastReceivedBatch", () => {
  it("is the newest batch with a real cost, skipping count adjustments and uncosted batches", () => {
    const last = lastReceivedBatch([
      b("old", 0, 500, { created_at: "2026-01-01T00:00:00.000Z" }),
      b("new", 3, 650, { created_at: "2026-05-01T00:00:00.000Z" }),
      b("adj", 1, 400, { batch_number: "ADJ-1", created_at: "2026-06-01T00:00:00.000Z" }),
      b("free", 1, 0, { created_at: "2026-07-01T00:00:00.000Z" }),
    ]);

    expect(last?.id).toBe("new");
  });
});
