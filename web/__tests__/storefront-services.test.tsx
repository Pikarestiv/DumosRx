import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const { servicesMock } = vi.hoisted(() => ({ servicesMock: vi.fn() }));
vi.mock("@/lib/api/storefront-services", () => ({ getStorefrontServices: servicesMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { StorefrontServices } from "@/components/storefront/storefront-services";
import { StorefrontI18nProvider } from "@/components/storefront/storefront-i18n-provider";
import { useCartStore } from "@/lib/store/use-cart-store";
import { checkoutLine } from "@/lib/storefront-cart-lines";

const renderServices = () =>
  render(
    <StorefrontI18nProvider defaultLocale="en" enabledLocales={["en"]}>
      <StorefrontServices storeSlug="salon" currency="XAF" whatsapp="+237 677 000 000" />
    </StorefrontI18nProvider>,
  );

const serviceList = (count: number, category = "Hair") =>
  Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: `Service ${i}`, description: null, category, price: 1000 + i }));

describe("storefront services", () => {
  beforeEach(() => act(() => useCartStore.setState({ carts: {} })));
  afterEach(() => vi.clearAllMocks());

  it("lists each service with its price and books it into the cart as a service line", async () => {
    servicesMock.mockResolvedValue([{ id: "s1", name: "Braiding", description: "Box braids", category: "Hair", price: 15000 }]);
    renderServices();

    expect(await screen.findByRole("heading", { name: "Braiding" })).toBeInTheDocument();
    expect(screen.getByText("Box braids")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book: Braiding" }));

    const cart = useCartStore.getState().carts.salon;
    expect(cart).toEqual([{ id: "s1", name: "Braiding", price: 15000, quantity: 1, kind: "service" }]);
    expect(cart.map(checkoutLine)).toEqual([{ service_id: "s1", quantity: 1 }]);
  });

  it("offers a WhatsApp enquiry instead of booking when the price is on request", async () => {
    servicesMock.mockResolvedValue([{ id: "s1", name: "Bridal styling", description: null, category: "Hair", price: 0 }]);
    renderServices();

    const link = await screen.findByRole("link", { name: /enquire on whatsapp/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/237677000000?text="));
    expect(screen.queryByRole("button", { name: /^book:/i })).toBeNull();
  });

  it("counts the services, filters them by category chip, and shows the category on each card", async () => {
    servicesMock.mockResolvedValue([...serviceList(2, "Dental"), ...serviceList(1, "Hair").map((s) => ({ ...s, id: "h1" }))]);
    renderServices();

    expect(await screen.findByText("3 services")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dental" }));

    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(2);
    expect(screen.getAllByText("Dental", { selector: "span" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "All · 3" }));
    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(3);
  });

  it("ends the grid with a '+ N more' tile that reveals every service", async () => {
    servicesMock.mockResolvedValue(serviceList(14));
    renderServices();

    const more = await screen.findByRole("button", { name: "Show all 14 services" });
    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(9);
    expect(within(more).getByText("+9")).toBeInTheDocument();

    fireEvent.click(more);

    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(14);
    expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
  });

  it("reveals a long list fifty services at a time", async () => {
    servicesMock.mockResolvedValue(serviceList(120));
    renderServices();

    fireEvent.click(await screen.findByRole("button", { name: "Show all 120 services" }));
    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(50);

    fireEvent.click(screen.getByRole("button", { name: "Show more services" }));
    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(100);

    fireEvent.click(screen.getByRole("button", { name: "Show more services" }));
    expect(screen.getAllByRole("button", { name: /^book:/i })).toHaveLength(120);
    expect(screen.queryByRole("button", { name: "Show more services" })).toBeNull();
  });

  it("renders nothing when the store has no services", async () => {
    servicesMock.mockResolvedValue([]);
    const { container } = renderServices();

    await vi.waitFor(() => expect(servicesMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
