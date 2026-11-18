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

function renderSubmit(overrides: Partial<Parameters<typeof usePoSubmit>[0]> = {}) {
  return renderHook(
    () =>
      usePoSubmit({
        selectedSupplierId: "s1",
        notes: "",
        items: [uncounted],
        paymentStatus: "unpaid",
        amountPaid: "",
        dueDate: "",
        totalAmount: 0,
        ...overrides,
      }),
    { wrapper },
  );
}

const counted = { ...uncounted, bulk_quantity: 2, subtotal: 200 } as POLineItemDraft;

describe("usePoSubmit with an uncounted row", () => {
  beforeEach(() => {
    toastError.mockClear();
    createPurchaseOrder.mockClear();
  });

  it("refuses to send the order and names the product", () => {
    const { result } = renderSubmit();
    act(() => result.current.handleSend());
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

describe("usePoSubmit sending and paying", () => {
  beforeEach(() => {
    toastError.mockClear();
    createPurchaseOrder.mockClear();
  });

  it("creates an order to a named vendor already marked as sent", async () => {
    const { result } = renderSubmit({ items: [counted], totalAmount: 200 });
    act(() => result.current.handleSend());
    await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalled());
    expect(createPurchaseOrder.mock.calls[0]).toEqual(["s1", "", [counted], "unpaid", 0, null, "sent"]);
  });

  it("will not send a walk-in purchase to a vendor", () => {
    const { result } = renderSubmit({ selectedSupplierId: "__self__", items: [counted] });
    act(() => result.current.handleSend());
    expect(toastError).toHaveBeenCalledWith("Choose the vendor this order is going to");
    expect(createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("saves no due date on a fully paid draft and records the full total as paid", async () => {
    const { result } = renderSubmit({ items: [counted], paymentStatus: "paid", dueDate: "2027-03-01", totalAmount: 200 });
    act(() => result.current.handleSaveDraft());
    await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalled());
    const [, , , paymentStatus, amountPaid, dueDate] = createPurchaseOrder.mock.calls[0] as unknown[];
    expect([paymentStatus, amountPaid, dueDate]).toEqual(["paid", 200, null]);
  });
});
