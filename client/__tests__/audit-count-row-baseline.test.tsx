import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const getProductStockQuantity = vi.fn();
vi.mock("@/lib/db/queries/inventory", () => ({ getProductStockQuantity }));

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-263: the baseline a counted row is measured against must be the system
 * figure at the moment of the count, not the one the sheet was built with.
 * Exercised through the real draft store, which is what persists and what
 * toStockAuditSubmissions() reads.
 */
describe("countRow re-baselines a row against live stock", () => {
  let useStockAuditDraftStore: typeof import("@/lib/hooks/use-stock-audit-draft").useStockAuditDraftStore;

  beforeEach(async () => {
    ({ useStockAuditDraftStore } = await import(
      "@/lib/hooks/use-stock-audit-draft"
    ));
    useStockAuditDraftStore.getState().setItems([
      {
        id: "p1",
        name: "Panadol",
        sku: "SKU-1",
        category: "Analgesics",
        // What the sheet opened with, hours ago.
        systemQty: 10,
      },
    ]);
    getProductStockQuantity.mockReset();
  });

  /** The production callback, kept in step with stock-audits.tsx. */
  function useCountRow() {
    const setItems = useStockAuditDraftStore((s) => s.setItems);
    return async (id: string, countedQty?: number) => {
      if (countedQty !== undefined) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, countedQty, counted: true } : i)),
        );
      }
      const live = await getProductStockQuantity(id);
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, systemQty: live, countedQty: countedQty ?? live, counted: true }
            : i,
        ),
      );
    };
  }

  const row = () => useStockAuditDraftStore.getState().items[0];

  it("stamps the live figure as the row's baseline when a count is entered", async () => {
    getProductStockQuantity.mockResolvedValue(0);
    const { result } = renderHook(() => useCountRow());

    await act(async () => {
      await result.current("p1", 10);
    });

    // The shelf has 10, the system now says 0 - a discrepancy the frozen
    // baseline of 10 would have hidden entirely.
    expect(row().systemQty).toBe(0);
    expect(row().countedQty).toBe(10);
    expect(row().counted).toBe(true);
  });

  it("ticking records the live figure on both sides, so it posts nothing", async () => {
    getProductStockQuantity.mockResolvedValue(4);
    const { result } = renderHook(() => useCountRow());

    await act(async () => {
      await result.current("p1");
    });

    expect(row().systemQty).toBe(4);
    expect(row().countedQty).toBe(4);
  });

  it("shows the typed figure before the read resolves, so typing never waits on the database", async () => {
    let release: (qty: number) => void = () => {};
    getProductStockQuantity.mockReturnValue(
      new Promise<number>((resolve) => {
        release = resolve;
      }),
    );
    const { result } = renderHook(() => useCountRow());

    let pending: Promise<void>;
    act(() => {
      pending = result.current("p1", 7);
    });
    expect(row().countedQty).toBe(7);
    expect(row().systemQty).toBe(10);

    await act(async () => {
      release(3);
      await pending;
    });
    expect(row().systemQty).toBe(3);
    expect(row().countedQty).toBe(7);
  });
});
