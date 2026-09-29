import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no layout, so the real virtualizer would compute an empty visible
// range - same stub the transaction-list test uses.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
    options: { scrollMargin: 0 },
  }),
}));

let rows: StockMovementDbRow[] = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: rows, isLoading: false, isFetching: false, refetch: vi.fn() }),
  keepPreviousData: undefined,
}));

const replace = vi.fn();
let searchParams = new URLSearchParams();
// One stable router object, not a fresh one per render: the ledger's
// ?action=create effect depends on it, and a new identity every render would
// re-fire that effect and re-open the flow the moment it is dismissed.
const router = { replace, push: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

const hasPermission = vi.fn((_key: string) => true);
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/context/pull-to-refresh-context", () => ({
  usePullToRefreshHandler: () => {},
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
const flowClose = vi.fn();
vi.mock("@/components/stock-batch/adjust-stock-flow", () => ({
  AdjustStockFlow: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="adjust-stock-flow">
      <button onClick={() => { flowClose(); onClose(); }}>flow-back</button>
    </div>
  ),
}));

import { StockAdjustmentsLedger } from "@/components/stock-batch/stock-adjustments-ledger";
import { buildAdjustmentReason } from "@/components/stock-batch/adjustment-derivations";

function movement(over: Partial<StockMovementDbRow> & { id: string }): StockMovementDbRow {
  return {
    product_id: "p1",
    movement_type: "adjustment",
    quantity: -2,
    movement_date: "2026-09-20T10:00:00.000Z",
    ...over,
  } as StockMovementDbRow;
}

describe("Stock Adjustments ledger", () => {
  beforeEach(() => {
    replace.mockReset();
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    searchParams = new URLSearchParams();
    rows = [
      movement({
        id: "m1",
        reference_id: "ADJ-1",
        reference_type: "stock_adjustment",
        product_name: "Paracetamol",
        reason: buildAdjustmentReason("damage", "Water damage"),
        quantity: -4,
      }),
      movement({
        id: "m2",
        reference_id: "ADJ-1",
        reference_type: "stock_adjustment",
        product_id: "p2",
        product_name: "Amoxil",
        reason: buildAdjustmentReason("damage", "Water damage"),
        quantity: -2,
      }),
      movement({
        id: "m3",
        reference_id: "AUD-9",
        reference_type: "stock_audit",
        product_name: "Vitamin C",
        reason: "Cycle count adjustment",
        quantity: 3,
        movement_date: "2026-09-10T10:00:00.000Z",
      }),
      movement({
        id: "m4",
        reference_id: "SALE-1",
        movement_type: "sale",
        product_name: "Ibuprofen",
        quantity: -1,
      }),
    ];
  });

  it("shows one row per adjustment, netting the quantities of its items", () => {
    render(<StockAdjustmentsLedger />);
    const rowsRendered = screen.getAllByTestId(/^adjustment-row-/);
    expect(rowsRendered).toHaveLength(2);

    const first = screen.getByTestId("adjustment-row-ADJ-1");
    expect(first.textContent).toContain("Damage");
    expect(first.textContent).toContain("2 items");
    expect(first.textContent).toContain("-6");
  });

  it("lists cycle counts alongside quick adjustments and labels their source", () => {
    render(<StockAdjustmentsLedger />);
    expect(screen.getByTestId("adjustment-row-AUD-9").textContent).toMatch(/cycle count/i);
    expect(screen.getByTestId("adjustment-row-ADJ-1").textContent).toMatch(/quick adjustment/i);
  });

  it("leaves sales and other movement types out of the ledger", () => {
    render(<StockAdjustmentsLedger />);
    expect(screen.queryByTestId("adjustment-row-SALE-1")).toBeNull();
  });

  it("filters by a search over reference id and product name", () => {
    render(<StockAdjustmentsLedger />);
    fireEvent.change(screen.getByPlaceholderText(/search by adjustment id or product/i), {
      target: { value: "vitamin" },
    });
    expect(screen.getAllByTestId(/^adjustment-row-/)).toHaveLength(1);
    expect(screen.getByTestId("adjustment-row-AUD-9")).toBeTruthy();
  });

  it("opens the Adjust Stock flow from ?action=create and clears the param", () => {
    searchParams = new URLSearchParams("action=create");
    render(<StockAdjustmentsLedger />);
    expect(screen.getByTestId("adjust-stock-flow")).toBeTruthy();
    expect(replace).toHaveBeenCalled();
  });

  // The creation flow is a full page, not a dialog over the ledger: while it
  // is up, none of the ledger's own chrome or rows may still be rendered.
  it("replaces the ledger entirely while the flow is open", () => {
    searchParams = new URLSearchParams("action=create");
    render(<StockAdjustmentsLedger />);
    expect(screen.queryAllByTestId(/^adjustment-row-/)).toHaveLength(0);
    expect(screen.queryByPlaceholderText(/search by adjustment id or product/i)).toBeNull();
  });

  it("returns to the ledger when the flow is dismissed", () => {
    searchParams = new URLSearchParams("action=create");
    render(<StockAdjustmentsLedger />);
    fireEvent.click(screen.getByText("flow-back"));

    expect(screen.queryByTestId("adjust-stock-flow")).toBeNull();
    expect(screen.getByTestId("adjustment-row-ADJ-1")).toBeTruthy();
  });

  it("refuses to open the flow for a viewer without the adjust permission", () => {
    hasPermission.mockImplementation((key: string) => key !== "adjust_stock_counts");
    searchParams = new URLSearchParams("action=create");
    render(<StockAdjustmentsLedger />);
    expect(screen.queryByTestId("adjust-stock-flow")).toBeNull();
    expect(screen.getByTestId("adjustment-row-ADJ-1")).toBeTruthy();
  });
});
