import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";

const { toastError, createPurchaseOrder, push } = vi.hoisted(() => ({
  toastError: vi.fn(),
  createPurchaseOrder: vi.fn(() => Promise.resolve("po-1")),
  push: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({ useDisplayName: () => (name: string) => name }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/db/procurement", () => ({ createPurchaseOrder, updatePurchaseOrder: vi.fn() }));
vi.mock("@/lib/db/procurement-receiving", () => ({
  createAndReceivePurchaseOrder: vi.fn(() => Promise.resolve("po-1")),
}));

import { usePoSubmit } from "@/app/(dashboard)/procurement/new/use-po-submit";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const uncounted = {
  product_id: "p1",
  product_name: "Paracetamol",
  bulk_unit: "Box",
  bulk_quantity: 0,
  units_per_bulk: 10,
  unit_cost: 100,
  subtotal: 0,
} as POLineItemDraft;

function renderSubmit() {
  return renderHook(
    () =>
      usePoSubmit({
        poType: "standard",
        selectedSupplierId: "s1",
        notes: "",
        items: [uncounted],
        paymentStatus: "unpaid",
        amountPaid: "",
        dueDate: "",
        totalAmount: 0,
        products: [],
      }),
    { wrapper },
  );
}

describe("usePoSubmit with an uncounted row", () => {
  beforeEach(() => {
    toastError.mockClear();
    createPurchaseOrder.mockClear();
  });

  it("refuses to submit the order and names the product", () => {
    const { result } = renderSubmit();
    act(() => result.current.handleSubmit());
    expect(toastError).toHaveBeenCalledWith("Enter a quantity for Paracetamol");
    expect(createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("still saves it as a draft holding 0", async () => {
    const { result } = renderSubmit();
    act(() => result.current.handleSaveDraft());
    await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });
});
