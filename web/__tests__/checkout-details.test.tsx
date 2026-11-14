import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push, postMock, toastError, cart } = vi.hoisted(() => ({
  push: vi.fn(),
  postMock: vi.fn(),
  toastError: vi.fn(),
  cart: { items: [{ id: "p1", name: "Panadol", price: 500, quantity: 2 }] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(() =>
      Promise.resolve({ data: { data: [{ id: "p1", selling_price: 500 }], store: { currency: "XAF", online_payment_available: false } } }),
    ),
    post: postMock,
  },
}));
vi.mock("@/lib/store/use-cart-store", () => ({
  useCart: () => ({ items: cart.items, getTotal: () => 1000, clearCart: vi.fn() }),
  useCartStore: { getState: () => ({ carts: { "store-1": cart.items }, reconcilePrices: vi.fn() }) },
}));

import { CheckoutForm } from "@/components/storefront/checkout-form";

const INSTRUCTIONS = "MTN MoMo 677 000 000\nOrange Money 699 000 000";

function renderForm(props: Partial<React.ComponentProps<typeof CheckoutForm>> = {}) {
  return render(<CheckoutForm storeSlug="store-1" {...props} />);
}

const fillContact = () => {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Marie Ngo" } });
  fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "677123456" } });
};

const placeOrder = async () => fireEvent.click(await screen.findByRole("button", { name: /place order/i }));
const sentBody = () => postMock.mock.calls[0][1] as Record<string, unknown>;

describe("checkout details", () => {
  beforeEach(() => {
    push.mockReset();
    toastError.mockReset();
    postMock.mockReset();
    postMock.mockResolvedValue({ data: { order: { id: "order-abc" } } });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("offers no transfer option when the store has given no payment details, because customers could not pay", async () => {
    renderForm();

    await screen.findByRole("button", { name: /place order/i });
    expect(screen.queryByLabelText("Transfer or mobile money")).toBeNull();
    expect(screen.getByLabelText("Pay when you collect")).toBeTruthy();
  });

  it("shows the store's payment details once the customer chooses transfer", async () => {
    renderForm({ paymentInstructions: INSTRUCTIONS });

    fireEvent.click(await screen.findByLabelText("Transfer or mobile money"));

    expect(screen.getByText("How to pay")).toBeTruthy();
    expect(screen.getByText(/MTN MoMo 677 000 000/)).toBeTruthy();
    expect(screen.getByText(/quote your order code/i)).toBeTruthy();
  });

  it("hides pickup or delivery when the store does not deliver, and sends no address for a pickup", async () => {
    renderForm();
    fillContact();

    expect(screen.queryByText("How would you like to receive it?")).toBeNull();
    expect(screen.queryByLabelText(/delivery address/i)).toBeNull();
    await placeOrder();

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ fulfilment_method: "pickup", payment_method: "in_store", customer_name: "Marie Ngo" });
    expect(sentBody()).not.toHaveProperty("customer_address");
    expect(sentBody()).not.toHaveProperty("customer_email");
  });

  it("asks for an address only for delivery, relabels the pay option, and sends both", async () => {
    renderForm({ deliveryAvailable: true, payOnDelivery: true, deliveryNote: "Douala only, 1,000 FCFA" });
    fillContact();

    fireEvent.click(screen.getByLabelText("Delivery"));
    expect(screen.getByText("Douala only, 1,000 FCFA")).toBeTruthy();
    expect(screen.getByLabelText("Pay on delivery")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/delivery address/i), { target: { value: "12 Rue Joss" } });
    await placeOrder();

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ fulfilment_method: "delivery", customer_address: "12 Rue Joss" });
  });

  it("offers pay on delivery only when the store accepts it, and falls back to what remains", async () => {
    renderForm({ deliveryAvailable: true, paymentInstructions: INSTRUCTIONS });
    fillContact();

    fireEvent.click(screen.getByLabelText("Delivery"));
    expect(screen.queryByLabelText("Pay on delivery")).toBeNull();
    expect(screen.getByLabelText("Transfer or mobile money")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/delivery address/i), { target: { value: "12 Rue Joss" } });
    await placeOrder();

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ fulfilment_method: "delivery", payment_method: "transfer" });
  });

  it("explains, and blocks the order, when delivery has no way to pay", async () => {
    renderForm({ deliveryAvailable: true });
    fillContact();
    fireEvent.click(screen.getByLabelText("Delivery"));

    expect(screen.getByRole("alert").textContent).toMatch(/cannot take payment for delivery orders/i);
    expect((await screen.findByRole("button", { name: /place order/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Pickup"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: /place order/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("will not send a delivery order with no address", async () => {
    renderForm({ deliveryAvailable: true, payOnDelivery: true });
    fillContact();
    fireEvent.click(screen.getByLabelText("Delivery"));

    fireEvent.change(screen.getByLabelText(/delivery address/i), { target: { value: "   " } });
    await placeOrder();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(postMock).not.toHaveBeenCalled();
  });

  it("includes the email when given, and requires it only for an online payment", async () => {
    renderForm();
    fillContact();
    expect(screen.getByLabelText("Email (for your confirmation)").hasAttribute("required")).toBe(false);

    fireEvent.change(screen.getByLabelText("Email (for your confirmation)"), { target: { value: " marie@example.com " } });
    await placeOrder();

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ customer_email: "marie@example.com" });
  });

  it("goes to the order confirmation with the new order's id, and clears nothing the customer might need", async () => {
    renderForm();
    fillContact();
    await placeOrder();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/store/store-1/order/?id=order-abc"));
  });

  it("remembers the customer's details for next time, and fills them in", async () => {
    const first = renderForm();
    fillContact();
    fireEvent.change(screen.getByLabelText("Email (for your confirmation)"), { target: { value: "marie@example.com" } });
    await placeOrder();
    await waitFor(() => expect(push).toHaveBeenCalled());
    first.unmount();

    renderForm();

    await waitFor(() => expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe("Marie Ngo"));
    expect((screen.getByLabelText(/phone number/i) as HTMLInputElement).value).toBe("677123456");
    expect((screen.getByLabelText("Email (for your confirmation)") as HTMLInputElement).value).toBe("marie@example.com");
  });

  it("does not remember details from an order that failed", async () => {
    postMock.mockRejectedValue(new Error("Insufficient stock"));
    renderForm();
    fillContact();
    await placeOrder();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Insufficient stock"));
    expect(window.localStorage.getItem("dumosrx-checkout-details")).toBeNull();
  });
});
