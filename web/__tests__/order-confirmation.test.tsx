import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api/base-client", () => ({ apiClient: { get: getMock } }));

import { OrderConfirmation } from "@/components/storefront/order-confirmation";
import { StorefrontI18nProvider } from "@/components/storefront/storefront-i18n-provider";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "0f3a9c1e-1111-2222-3333-444455556666",
  code: "0F3A9C1E",
  order_status: "pending",
  payment_status: "pending",
  payment_method: "in_store",
  fulfilment_method: "pickup",
  ready: false,
  cancel_reason: null,
  payment_instructions: null,
  total_amount: "3000.00",
  currency: "XAF",
  branch_name: "Divamax",
  store_phone: "699000000",
  whatsapp: "+237 677 000 000",
  items: [
    { product_name: "BULB 12W", quantity: 2 },
    { product_name: "Switch", quantity: 1 },
  ],
  ...overrides,
});

const open = (query = "?id=0f3a9c1e-1111-2222-3333-444455556666") => window.history.replaceState({}, "", `/store/divamax/order/${query}`);

describe("order confirmation", () => {
  beforeEach(() => {
    getMock.mockReset();
    window.localStorage.clear();
    open();
  });

  it("shows the order code, items, total and how it will be received", async () => {
    getMock.mockResolvedValue({ data: { order: order() } });
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText("Thank you, your order is in")).toBeTruthy();
    expect(screen.getByText("0F3A9C1E")).toBeTruthy();
    expect(screen.getByText(/2 × Bulb 12W/)).toBeTruthy();
    expect(screen.getByText(/FCFA.3,000/)).toBeTruthy();
    expect(screen.getByText("You will collect it from the store.")).toBeTruthy();
    expect(screen.getByText("You pay when you collect.")).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith("/storefront/divamax/orders/0f3a9c1e-1111-2222-3333-444455556666");
  });

  it("tells a transfer customer they have not paid yet and shows the store's details", async () => {
    getMock.mockResolvedValue({ data: { order: order({ payment_method: "transfer", payment_instructions: "MTN MoMo 677 000 000" }) } });
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText(/Not paid yet/)).toBeTruthy();
    expect(screen.getByText("MTN MoMo 677 000 000")).toBeTruthy();
    expect(screen.getByText("How to pay")).toBeTruthy();
  });

  it("shows no payment details for a customer paying at pickup or online", async () => {
    getMock.mockResolvedValue({ data: { order: order({ payment_method: "paystack", payment_status: "paid", payment_instructions: "should not show" }) } });
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText("Paid online.")).toBeTruthy();
    expect(screen.queryByText("should not show")).toBeNull();
    expect(screen.queryByText("How to pay")).toBeNull();
  });

  it("builds a WhatsApp message with the order code, items, total and the customer's name", async () => {
    window.localStorage.setItem("dumosrx-checkout-details", JSON.stringify({ customer_name: "Marie Ngo" }));
    getMock.mockResolvedValue({ data: { order: order() } });
    render(<OrderConfirmation storeSlug="divamax" />);

    const link = await screen.findByRole("link", { name: "Send my order on WhatsApp" });
    const url = new URL(link.getAttribute("href") ?? "");

    expect(url.origin + url.pathname).toBe("https://wa.me/237677000000");
    const text = url.searchParams.get("text") ?? "";
    expect(text).toContain("0F3A9C1E");
    expect(text).toContain("2 x Bulb 12W, 1 x Switch");
    expect(text).toContain("Marie Ngo");
  });

  it("offers no WhatsApp button when the store has no number", async () => {
    getMock.mockResolvedValue({ data: { order: order({ whatsapp: null }) } });
    render(<OrderConfirmation storeSlug="divamax" />);

    await screen.findByText("Thank you, your order is in");
    expect(screen.queryByRole("link", { name: /whatsapp/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the store" })).toBeTruthy();
  });

  it("says when the store has marked the order ready", async () => {
    getMock.mockResolvedValue({ data: { order: order({ ready: true }) } });
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText("The store says your order is ready.")).toBeTruthy();
  });

  it("says an unpaid order expired, so the customer knows to order again", async () => {
    getMock.mockResolvedValue({ data: { order: order({ order_status: "cancelled", cancel_reason: "expired" }) } });
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText(/not paid in time/)).toBeTruthy();
  });

  it("is honest that no text message is sent, and mentions the phone and the optional email", async () => {
    getMock.mockResolvedValue({ data: { order: order() } });
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText(/may contact you to confirm/i)).toBeTruthy();
    expect(screen.getByText(/We do not send text messages/)).toBeTruthy();
    expect(screen.getByText(/If you entered an email address/)).toBeTruthy();
    expect(screen.getByText(/699000000/)).toBeTruthy();
  });

  it("does not load forever on a link with no query string at all", async () => {
    open("");
    render(<OrderConfirmation storeSlug="divamax" />);

    expect(await screen.findByText(/couldn't find that order/i)).toBeTruthy();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("says the order was not found for an unknown order, and for a link with no order in it", async () => {
    getMock.mockRejectedValue(new Error("404"));
    const unknown = render(<OrderConfirmation storeSlug="divamax" />);
    expect(await screen.findByText(/couldn't find that order/i)).toBeTruthy();
    unknown.unmount();

    open("?foo=bar");
    getMock.mockReset();
    render(<OrderConfirmation storeSlug="divamax" />);
    expect(await screen.findByText(/couldn't find that order/i)).toBeTruthy();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("speaks French on a French storefront", async () => {
    getMock.mockResolvedValue({ data: { order: order({ payment_method: "transfer", payment_instructions: "MoMo 677" }) } });
    render(
      <StorefrontI18nProvider defaultLocale="fr" enabledLocales={["fr"]}>
        <OrderConfirmation storeSlug="divamax" />
      </StorefrontI18nProvider>,
    );

    expect(await screen.findByText("Merci, votre commande est enregistrée")).toBeTruthy();
    expect(screen.getByText(/Pas encore payée/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Envoyer ma commande sur WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Retour à la boutique" })).toBeTruthy();
    expect(screen.getByText(/1 500|3 000/)).toBeTruthy();
  });
});
