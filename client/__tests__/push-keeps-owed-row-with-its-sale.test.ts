import { describe, it, expect } from "vitest";
import { chunkPushQueue } from "@/lib/db/sync-engine/push-queue-prep";
import type { SyncQueueItem } from "@/lib/types/sync";

let nextId = 1;
const item = (table: string, payload: Record<string, unknown>): SyncQueueItem =>
  ({ id: nextId++, table_name: table, record_id: String(payload.id), operation: "INSERT", payload: JSON.stringify(payload) }) as SyncQueueItem;

const filler = (n: number) => Array.from({ length: n }, (_, i) => item("products", { id: `p${nextId}-${i}` }));
const saleRow = item("stock_movements", { id: "m-sale", movement_type: "sale", reference_type: "sale", reference_id: "S" });
const between = [item("stock_batches", { id: "b1" }), item("audit_logs", { id: "log-1" })];
const owedRow = item("stock_movements", { id: "m-owed", movement_type: "adjustment", reference_type: "backorder", reference_id: "S" });

const chunkOf = (chunks: SyncQueueItem[][], id: number) => chunks.findIndex((c) => c.some((i) => i.id === id));

describe("chunkPushQueue keeps an owed row in the same push as its sale row", () => {
  it("moves the boundary past the owed row when it would fall between them", () => {
    const queue = [...filler(48), saleRow, ...between, owedRow, ...filler(10)];
    const chunks = chunkPushQueue(queue, 50);

    expect(chunkOf(chunks, owedRow.id)).toBe(chunkOf(chunks, saleRow.id));
    expect(chunks.flat()).toEqual(queue);
  });

  it("chunks exactly as before when no owed row straddles a boundary", () => {
    const queue = filler(120);
    expect(chunkPushQueue(queue, 50).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});
