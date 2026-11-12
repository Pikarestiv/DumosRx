import { describe, it, expect, vi, beforeEach } from "vitest";
import { asAsync } from "./helpers/as-async";

interface MovementRecord {
  id: string;
  product_id: string;
  stock_batch_id?: string;
  movement_type: string;
  quantity: number;
  reference_id?: string;
  reference_type?: string;
  store_id?: string;
  status?: string | null;
  _deleted?: number;
}

let movements: MovementRecord[] = [];
let nextIdNum = 1;

vi.mock("@/lib/db/local-database", () => ({
  query: vi.fn(
    asAsync((sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM stores WHERE id = ?")) {
        const id = params[0] as string;
        if (id === "store-1") return [{ id: "store-1", name: "Main Store" }];
        if (id === "store-2") return [{ id: "store-2", name: "Branch Store" }];
        return [];
      }
      if (sql.includes("FROM products WHERE id = ?")) {
        return [
          {
            id: params[0],
            name: "Amoxicillin 500mg",
            barcode: "AMX-500",
            category_id: null,
            selling_price: 250,
            base_unit: "Capsule",
            store_id: params[1],
          },
        ];
      }
      if (sql.includes("FROM stock_batches") && sql.includes("product_id = ?")) {
        return [
          {
            id: "batch-src-1",
            quantity: 50,
            cost_price: 150,
            expiry_date: "2027-12-31",
            created_at: "2026-01-01T00:00:00Z",
          },
        ];
      }
      if (sql.includes("FROM products WHERE barcode = ?") || sql.includes("FROM products WHERE name = ?")) {
        return [];
      }
      if (sql.includes("FROM stock_movements") && sql.includes("status = ?")) {
        const [refId, refType, status] = params as string[];
        return movements
          .filter(
            (m) =>
              m.reference_id === refId &&
              m.reference_type === refType &&
              m.status === status &&
              !m._deleted,
          )
          .map((m) => ({ id: m.id, store_id: m.store_id }));
      }
      return [];
    }),
  ),
  insert: vi.fn(
    asAsync((table: string, data: Record<string, unknown>) => {
      const id = `${table}-${nextIdNum++}`;
      if (table === "stock_movements") {
        movements.push({ ...(data as unknown as MovementRecord), id });
      }
      return id;
    }),
  ),
  update: vi.fn(
    asAsync((table: string, id: string, data: Record<string, unknown>) => {
      if (table === "stock_movements") {
        const row = movements.find((m) => m.id === id);
        if (row) Object.assign(row, data);
      }
      return id;
    }),
  ),
  transaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  generateId: vi.fn(() => `xfer-${nextIdNum++}`),
}));

import {
  transferStock,
  markStockTransferReviewed,
  STOCK_TRANSFER_NEEDS_REVIEW_STATUS,
  STOCK_TRANSFER_REVIEWED_STATUS,
} from "@/lib/db/queries/stock-transfers";

describe("stock-transfer role-based review state machine", () => {
  beforeEach(() => {
    movements = [];
    nextIdNum = 1;
    vi.clearAllMocks();
  });

  it("marks both transfer legs as needs_review when initiated by cashier", async () => {
    const result = await transferStock({
      sourceStoreId: "store-1",
      destStoreId: "store-2",
      productId: "prod-1",
      quantity: 10,
      performedBy: "user-cashier-1",
      initiatedByRole: "cashier",
    });

    expect(result.quantityTransferred).toBe(10);
    const legs = movements.filter((m) => m.reference_id === result.transferId);
    expect(legs).toHaveLength(2);

    const outLeg = legs.find((m) => m.movement_type === "transfer_out");
    const inLeg = legs.find((m) => m.movement_type === "transfer_in");

    expect(outLeg?.status).toBe(STOCK_TRANSFER_NEEDS_REVIEW_STATUS);
    expect(inLeg?.status).toBe(STOCK_TRANSFER_NEEDS_REVIEW_STATUS);

    const reviewedCount = await markStockTransferReviewed(result.transferId);
    expect(reviewedCount).toBe(2);

    expect(outLeg?.status).toBe(STOCK_TRANSFER_REVIEWED_STATUS);
    expect(inLeg?.status).toBe(STOCK_TRANSFER_REVIEWED_STATUS);
  });

  it("marks both transfer legs with null status when initiated by admin", async () => {
    const result = await transferStock({
      sourceStoreId: "store-1",
      destStoreId: "store-2",
      productId: "prod-1",
      quantity: 5,
      performedBy: "user-admin-1",
      initiatedByRole: "admin",
    });

    const legs = movements.filter((m) => m.reference_id === result.transferId);
    expect(legs).toHaveLength(2);

    const outLeg = legs.find((m) => m.movement_type === "transfer_out");
    const inLeg = legs.find((m) => m.movement_type === "transfer_in");

    expect(outLeg?.status).toBeNull();
    expect(inLeg?.status).toBeNull();
  });
});
