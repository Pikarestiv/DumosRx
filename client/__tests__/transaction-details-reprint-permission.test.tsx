import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAdmin: false, user: { id: "u1", role: "sales_staff" } }),
}));

vi.mock("@/lib/db/queries/sales", () => ({
  getTransactionDetails: vi.fn(async () => ({ items: [], returnsData: [] })),
}));

vi.mock("@/lib/db/queries/customers", () => ({
  getCustomerById: vi.fn(async () => null),
}));

vi.mock("@/lib/hooks/use-customer-mutations", () => ({
  useRecordCustomerPaymentMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-redeem-reseller-commission-mutation", () => ({
  useRedeemResellerCommissionMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/components/pos/use-print-receipt", () => ({
  usePrintReceipt: () => ({ print: vi.fn(), portal: null, paperSize: "80mm" }),
}));

vi.mock("@/components/customers/record-payment-modal", () => ({
  RecordPaymentModal: () => null,
}));

vi.mock("@/components/pos/transaction-items-view", () => ({
  TransactionItemsView: () => null,
}));

import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";
import type { SaleWithDetails } from "@/lib/types/sale";

const sale = {
  id: "s1",
  transaction_number: "TRX-001",
  created_at: "2026-09-28T10:00:00.000Z",
  total_amount: 12000,
  amount_paid: 12000,
  payment_method: "cash",
  payment_status: "paid",
  customer_name: "Ada",
} as unknown as SaleWithDetails;

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionDetailsDialog sale={sale} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

/**
 * Reprinting a completed sale's receipt (or its tax invoice) is the real
 * action behind "reprint_receipt". The receipt shown immediately after
 * checkout is part of process_sales and stays ungated; this is only the
 * after-the-fact copy pulled from transaction history.
 */
describe("Transaction details reprint permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers Print Receipt to a user with reprint_receipt", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /Print Receipt/ })).toBeTruthy();
  });

  it("hides Print Receipt from a user without reprint_receipt", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "reprint_receipt",
    );
    renderDialog();
    expect(screen.queryByRole("button", { name: /Print Receipt/ })).toBeNull();
  });

  it("still shows the transaction itself without reprint_receipt", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "reprint_receipt",
    );
    renderDialog();
    expect(screen.getByText(/TRX-001/)).toBeTruthy();
  });

  it("checks the reprint_receipt key specifically", () => {
    renderDialog();
    expect(hasPermission).toHaveBeenCalledWith("reprint_receipt");
  });
});
