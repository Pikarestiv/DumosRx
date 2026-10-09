import { describe, it, expect, vi } from "vitest";
vi.mock("idb-keyval", () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) }));

/**
 * devtools-hooks.ts imports from ./index, and index.ts imports it for its side
 * effect — a deliberate cycle, taken so index.ts stays under the 350-line
 * limit. It is safe only because the imported exports are function
 * DECLARATIONS and therefore hoisted: converting either to
 * `const fn = () => {}` would make these hooks silently undefined. This test
 * is the guard for that.
 */
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
