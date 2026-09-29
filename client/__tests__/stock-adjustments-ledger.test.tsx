import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

// The ledger picks a virtualized desktop grid or a date-grouped mobile card
// list off this hook, exactly as stock-movements.tsx does, so the row
// assertions below run against both branches.
let isDesktop = true;
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => isDesktop,
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

function seedRows() {
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
}

// Desktop virtualized grid vs. mobile grouped cards are conditionally
// rendered, never CSS-hidden, so each branch must be asserted on its own.
describe("Stock Adjustments ledger responsive split", () => {
  beforeEach(() => {
    replace.mockReset();
    hasPermission.mockImplementation(() => true);
    searchParams = new URLSearchParams();
    seedRows();
  });

  it("renders the column-header row and no date headings on desktop", () => {
    isDesktop = true;
    render(<StockAdjustmentsLedger />);

    expect(screen.getByText("Adjustment ID")).toBeTruthy();
    expect(screen.getByText("Net qty")).toBeTruthy();
    expect(screen.queryByText("SEP 20, 2026")).toBeNull();
  });

  it("renders date-grouped cards and no column headers on mobile", () => {
    isDesktop = false;
    render(<StockAdjustmentsLedger />);

    expect(screen.queryByText("Adjustment ID")).toBeNull();
    expect(screen.queryByText("Net qty")).toBeNull();
    expect(screen.getByText("SEP 20, 2026")).toBeTruthy();
    expect(screen.getByText("SEP 10, 2026")).toBeTruthy();
  });

  it("groups each adjustment card under the heading for its own date", () => {
    isDesktop = false;
    render(<StockAdjustmentsLedger />);

    const heading = screen.getByText("SEP 10, 2026");
    const group = heading.parentElement as HTMLElement;
    expect(within(group).getByTestId("adjustment-row-AUD-9")).toBeTruthy();
    expect(within(group).queryByTestId("adjustment-row-ADJ-1")).toBeNull();
  });

  it("mounts each adjustment exactly once per branch", () => {
    isDesktop = true;
    const desktop = render(<StockAdjustmentsLedger />);
    expect(screen.getAllByTestId("adjustment-row-ADJ-1")).toHaveLength(1);
    desktop.unmount();

    isDesktop = false;
    render(<StockAdjustmentsLedger />);
    expect(screen.getAllByTestId("adjustment-row-ADJ-1")).toHaveLength(1);
  });
});

describe.each([
  ["desktop", true],
  ["mobile", false],
])("Stock Adjustments ledger (%s)", (_label, desktop) => {
  beforeEach(() => {
    isDesktop = desktop;
    replace.mockReset();
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    searchParams = new URLSearchParams();
    seedRows();
  });

  it("shows one entry per adjustment, netting the quantities of its items", () => {
    render(<StockAdjustmentsLedger />);
    expect(screen.getAllByTestId(/^adjustment-row-/)).toHaveLength(2);

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

  it("shows an empty state when nothing matches", () => {
    render(<StockAdjustmentsLedger />);
    fireEvent.change(screen.getByPlaceholderText(/search by adjustment id or product/i), {
      target: { value: "nothing matches this" },
    });
    expect(screen.getByText(/no adjustments found/i)).toBeTruthy();
  });
});

describe("Stock Adjustments ledger", () => {
  beforeEach(() => {
    isDesktop = true;
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
