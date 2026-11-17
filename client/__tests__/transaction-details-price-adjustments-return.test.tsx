import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";

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
  useAuth: () => ({
    isAdmin: true,
    user: { id: "u1", role: "store_owner" },
  }),
}));

let mockItems: SaleItemDetail[] = [];

vi.mock("@/lib/db/queries/sales", () => ({
  getTransactionDetails: vi.fn(() =>
    Promise.resolve({
      items: mockItems,
      returnsData: [],
      services: [],
    }),
  ),
}));

vi.mock("@/lib/db/queries/customers", () => ({
  getCustomerById: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/hooks/use-customer-mutations", () => ({
  useRecordCustomerPaymentMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-redeem-reseller-commission-mutation", () => ({
  useRedeemResellerCommissionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/pos/use-print-receipt", () => ({
  usePrintReceipt: () => ({ print: vi.fn(), portal: null }),
}));

vi.mock("@/components/customers/record-payment-modal", () => ({
  RecordPaymentModal: () => null,
}));

vi.mock("@/components/pos/transaction-items-view", () => ({
  TransactionItemsView: () => null,
}));

const baseSale: SaleWithDetails = {
  id: "s-adj-1",
  transaction_number: "TRX-ADJ-001",
  created_at: "2026-10-23T10:00:00.000Z",
  subtotal: 600,
  total_amount: 600,
  amount_paid: 600,
  payment_method: "cash",
  payment_status: "paid",
  user_id: "u1",
  is_reseller_sale: 1,
  markup_type: "reseller",
  reseller_markup_amount: 150,
  reseller_commission_amount: 15,
};

function renderDialog(sale: SaleWithDetails) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionDetailsDialog sale={sale} open onOpenChange={vi.fn()} currencyCode="NGN" />
    </QueryClientProvider>,
  );
}

describe("A-310: Transaction details price adjustments shrink on return", () => {
  it("shrinks list price markup by returned quantity so it matches reseller markup", async () => {
    mockItems = [
      {
        id: "item-1",
        sale_id: baseSale.id,
        product_id: "prod-1",
        quantity: 4,
        returned_quantity: 1,
        unit_price: 150,
        list_price: 100,
        total_price: 600,
      },
    ];

    renderDialog(baseSale);

    expect(await screen.findByText(/Against list price:/i)).toBeTruthy();
    expect(await screen.findByText(/\+.*150/)).toBeTruthy();
    expect(screen.queryByText(/200/)).toBeNull();
  });

  it("hides against-list-price badge when all marked up units have been returned", async () => {
    mockItems = [
      {
        id: "item-1",
        sale_id: baseSale.id,
        product_id: "prod-1",
        quantity: 4,
        returned_quantity: 4,
        unit_price: 150,
        list_price: 100,
        total_price: 600,
      },
    ];

    renderDialog(baseSale);

    await screen.findByText("Transaction Details");
    expect(screen.queryByText(/Against list price:/i)).toBeNull();
  });
});
