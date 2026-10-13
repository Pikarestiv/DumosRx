import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SaleWithDetails } from "@/lib/types/sale";

let authState = {
  isAdmin: false,
  user: { id: "cashier-1", role: "sales_staff" } as { id: string; role: string } | null,
};

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
  useHasPermission: () => true,
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => authState,
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
  useRedeemResellerCommissionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

const resellerSale: SaleWithDetails = {
  id: "s1",
  transaction_number: "TRX-001",
  created_at: "2026-09-28T10:00:00.000Z",
  subtotal: 12000,
  total_amount: 15000,
  amount_paid: 15000,
  payment_method: "cash",
  payment_status: "paid",
  customer_name: "John Doe",
  user_id: "cashier-1",
  is_reseller_sale: 1,
  markup_type: "reseller",
  reseller_markup_amount: 3000,
  reseller_commission_amount: 1500,
  reseller_commission_redeemed: 0,
};

function renderDialog(sale: SaleWithDetails) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionDetailsDialog sale={sale} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("Transaction details reseller markup visibility", () => {
  beforeEach(() => {
    authState = {
      isAdmin: false,
      user: { id: "cashier-1", role: "sales_staff" },
    };
  });

  it("shows reseller markup and redeem action to the cashier who made the sale", () => {
    renderDialog(resellerSale);

    expect(screen.getByText(/Reseller markup:/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Redeem Commission/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Store Claims Markup/i })).toBeTruthy();
  });

  it("shows reseller markup and redeem action to an admin even if they did not make the sale", () => {
    authState = {
      isAdmin: true,
      user: { id: "admin-99", role: "store_owner" },
    };

    renderDialog(resellerSale);

    expect(screen.getByText(/Reseller markup:/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Redeem Commission/i })).toBeTruthy();
  });

  it("hides reseller markup and redeem action from a cashier who did NOT make the sale", () => {
    authState = {
      isAdmin: false,
      user: { id: "other-cashier", role: "sales_staff" },
    };

    renderDialog(resellerSale);

    expect(screen.queryByText(/Reseller markup:/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Redeem Commission/i })).toBeNull();
  });
});
