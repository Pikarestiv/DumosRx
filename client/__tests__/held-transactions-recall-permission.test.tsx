import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

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

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/hooks/use-sales-data", () => ({
  useHeldTransactions: () => ({
    heldItems: [
      {
        id: "h1",
        customer_name: "Ada",
        items_json: "[{}]",
        total_amount: 4200,
        created_at: new Date("2026-09-28T10:00:00Z").toISOString(),
      },
    ],
    loading: false,
    refetch: vi.fn(),
  }),
  useDeleteHeldTransactionMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));

import { HeldTransactionsDialog } from "@/components/pos/held-transactions-dialog";

function renderDialog() {
  render(
    <HeldTransactionsDialog isOpen onClose={vi.fn()} onRecall={vi.fn()} />,
  );
}

// Resuming a parked sale is the other half of "hold_sales".
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-held-transactions-recall-permission-test-tsx-L64
describe("Held transactions recall permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers Recall to a user with hold_sales", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /Recall/ })).toBeTruthy();
  });

  it("hides Recall from a user without hold_sales", () => {
    hasPermission.mockImplementation((key: string) => key !== "hold_sales");
    renderDialog();
    expect(screen.queryByRole("button", { name: /Recall/ })).toBeNull();
  });

  it("still lists the held sale without hold_sales", () => {
    hasPermission.mockImplementation((key: string) => key !== "hold_sales");
    renderDialog();
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("checks the hold_sales key specifically", () => {
    renderDialog();
    expect(hasPermission).toHaveBeenCalledWith("hold_sales");
  });
});
