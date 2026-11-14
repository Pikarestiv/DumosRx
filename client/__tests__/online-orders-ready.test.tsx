import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { getOrders, markReady, toastSuccess, toastError } = vi.hoisted(() => ({
  getOrders: vi.fn(),
  markReady: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { getOnlineOrders: getOrders, markOnlineOrderReady: markReady } }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock("@/lib/store/use-online-orders-modal", () => ({ useOnlineOrdersModal: () => ({ isOpen: true, onClose: () => {} }) }));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { currency: "XAF" } }) }));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({ useUppercaseDisplayClass: () => "" }));
vi.mock("@/lib/hooks/use-stock-visibility", () => ({ useStockVisibility: () => ({ canSeeQuantities: true }) }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({ useFeatureGate: () => ({ canSellWithoutStock: false }) }));
vi.mock("@/lib/hooks/use-fulfill-online-order-mutation", () => ({
  useFulfillOnlineOrderMutation: () => ({ isPending: false, variables: undefined, mutate: vi.fn() }),
  findOnlineOrderStockGaps: vi.fn(() => Promise.resolve([])),
  describeStockGap: () => "",
}));
vi.mock("@/components/ui/responsive-modal", () => ({
  ResponsiveModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { OnlineOrdersModal } from "@/components/pos/online-orders-modal";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "o1",
  customer_name: "Marie Ngo",
  customer_phone: "677123456",
  customer_email: "marie@example.com",
  fulfilment_method: "pickup",
  total_amount: 3000,
  payment_method: "transfer",
  order_status: "pending",
  ready_at: null,
  created_at: "2026-11-15T10:00:00Z",
  items: [],
  ...overrides,
});

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <OnlineOrdersModal />
    </QueryClientProvider>,
  );
}

describe("online orders: telling the customer it is ready", () => {
  beforeEach(() => {
    getOrders.mockReset();
    markReady.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("offers to email a customer who gave an address, and says so when it has", async () => {
    getOrders.mockResolvedValueOnce({ orders: [order()] }).mockResolvedValue({ orders: [order({ ready_at: "2026-11-15T10:05:00Z" })] });
    markReady.mockResolvedValue({ order: order(), emailed: true });
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Email customer: ready" }));

    await waitFor(() => expect(markReady).toHaveBeenCalledWith("o1"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Customer emailed that their order is ready"));
    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Email customer: ready" })).toBeNull();
  });

  it("tells staff to phone a customer who left no email", async () => {
    getOrders.mockResolvedValue({ orders: [order({ customer_email: null })] });
    markReady.mockResolvedValue({ order: order(), emailed: false });
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Mark ready" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining("call 677123456")));
  });

  it("shows the customer's email, and the delivery address for a delivery", async () => {
    getOrders.mockResolvedValue({ orders: [order({ fulfilment_method: "delivery", customer_address: "12 Rue Joss" })] });
    renderModal();

    expect(await screen.findByText(/marie@example.com/)).toBeTruthy();
    expect(screen.getByText(/Delivery: 12 Rue Joss/)).toBeTruthy();
  });

  it("does not offer the button for an order already marked ready or already finished", async () => {
    getOrders.mockResolvedValue({
      orders: [order({ id: "o2", ready_at: "2026-11-15T10:05:00Z" }), order({ id: "o3", order_status: "fulfilled" })],
    });
    renderModal();

    await screen.findByText("Ready");
    expect(screen.queryByRole("button", { name: /Email customer: ready|Mark ready/ })).toBeNull();
  });

  it("reports a failure and leaves the order alone", async () => {
    getOrders.mockResolvedValue({ orders: [order()] });
    markReady.mockRejectedValue(new Error("This order is already cancelled."));
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Email customer: ready" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This order is already cancelled."));
    expect(screen.queryByText("Ready")).toBeNull();
  });
});
