import { describe, it, expect, vi } from "vitest";
vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));

// devtools-hooks.ts imports from ./index, and index.ts imports it for its side effect — a deliberate cycle, taken so index…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-devtools-hooks-binding-test-ts-L4
describe("devtools hooks under a circular import", () => {
  it("binds real functions, not undefined", async () => {
    await import("@/lib/db/sync-engine/index");
    const w = window as unknown as Record<string, unknown>;
    expect(typeof w.__forceFullResync).toBe("function");
    expect(typeof w.__reconcileStockQuantities).toBe("function");
    expect(typeof w.__verifyStockIntegrity).toBe("function");
    expect(typeof w.__foldStockQuantities).toBe("function");
  });
});
