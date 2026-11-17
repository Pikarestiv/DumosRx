import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";
import { ReturnDialog } from "@/components/pos/return-dialog";

const toastError = vi.fn();
const toastWarning = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Cashier" },
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { uppercase_display_enabled: 0, currency: "NGN" },
  }),
}));

const mockMutateAsync = vi.fn();
vi.mock("@/lib/hooks/use-process-return-mutation", () => ({
  useProcessReturnMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

let mockSaleByIdResult: SaleWithDetails | null = null;
let mockSaleByIdError: Error | null = null;

vi.mock("@/lib/db/queries/sales", () => ({
  getSaleById: vi.fn(() => {
    if (mockSaleByIdError) return Promise.reject(mockSaleByIdError);
    return Promise.resolve(mockSaleByIdResult);
  }),
  getTransactionDetails: vi.fn(() =>
    Promise.resolve({
      items: [
        {
          id: "item-1",
          sale_id: "sale-1",
          product_id: "prod-1",
          quantity: 2,
          returned_quantity: 0,
          unit_price: 150,
          list_price: 100,
          total_price: 300,
          product_name: "Test Medicine",
        } as SaleItemDetail,
      ],
      services: [],
      returnsData: [],
    }),
  ),
}));

const baseSale: SaleWithDetails = {
  id: "sale-1",
  transaction_number: "TRX-001",
  created_at: "2026-10-23T10:00:00.000Z",
  subtotal: 300,
  total_amount: 300,
  amount_paid: 300,
  payment_method: "cash",
  payment_status: "paid",
  user_id: "user-1",
  is_reseller_sale: 1,
  markup_type: "reseller",
  reseller_markup_amount: 100,
  reseller_commission_amount: 10,
  reseller_commission_redeemed: 0,
  reseller_commission_redeemed_at: undefined,
};

function renderDialog(onSuccess = vi.fn(), onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReturnDialog
        open={true}
        onOpenChange={onOpenChange}
        sale={baseSale}
        onSuccess={onSuccess}
        currencyCode="NGN"
      />
    </QueryClientProvider>,
  );
}

describe("A-310: ReturnDialog error handling and redemption check at confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaleByIdError = null;
    mockSaleByIdResult = { ...baseSale };
  });

  it("handles getSaleById error in handleInitialSubmit with a toast instead of silent failure", async () => {
    mockSaleByIdError = new Error("Database locked");

    renderDialog();

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole("button", { name: /Confirm Return & Refund/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to load current sale details");
    });
    expect(screen.queryByText(/You are about to process a return/i)).toBeNull();
  });

  it("warns and pauses when commission is redeemed between opening confirm dialog and clicking submit", async () => {
    // Step 1: Initial fetch returns unredeemed sale
    mockSaleByIdResult = { ...baseSale, reseller_commission_redeemed_at: undefined };

    renderDialog();

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole("button", { name: /Confirm Return & Refund/i });
    fireEvent.click(submitBtn);

    // Confirm dialog opens
    expect(await screen.findByRole("button", { name: /Yes, Process Return/i })).toBeTruthy();

    // Step 2: Interim redemption occurs while dialog is open
    mockSaleByIdResult = {
      ...baseSale,
      reseller_commission_redeemed: 1,
      reseller_commission_claim_type: "commission",
      reseller_commission_redeemed_amount: 10,
      reseller_commission_redeemed_at: "2026-10-23T10:05:00.000Z",
    };

    const confirmBtn = screen.getByRole("button", { name: /Yes, Process Return/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(toastWarning).toHaveBeenCalledWith(
        "Reseller commission was redeemed while this return was open. Please review the updated return confirmation.",
      );
    });

    // mutateAsync was not called because the user must review the warning
    expect(mockMutateAsync).not.toHaveBeenCalled();

    // Re-opening confirmation now displays the owed-back notice from the refreshed sale
    const reSubmitBtn = screen.getByRole("button", { name: /Confirm Return & Refund/i });
    fireEvent.click(reSubmitBtn);

    expect(
      await screen.findByText(/The reseller was already paid commission on this sale/i),
    ).toBeTruthy();
  });

  it("successfully calls mutateAsync and onSuccess when sale status is unchanged", async () => {
    mockSaleByIdResult = { ...baseSale };
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    renderDialog(onSuccess, onOpenChange);

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole("button", { name: /Confirm Return & Refund/i });
    fireEvent.click(submitBtn);

    const confirmBtn = await screen.findByRole("button", { name: /Yes, Process Return/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows toast error when getSaleById fails during final confirmation", async () => {
    mockSaleByIdResult = { ...baseSale };

    renderDialog();

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole("button", { name: /Confirm Return & Refund/i });
    fireEvent.click(submitBtn);

    await screen.findByRole("button", { name: /Yes, Process Return/i });

    // Make getSaleById throw on second call
    mockSaleByIdError = new Error("Connection failed");

    const confirmBtn = screen.getByRole("button", { name: /Yes, Process Return/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to verify current sale status");
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
