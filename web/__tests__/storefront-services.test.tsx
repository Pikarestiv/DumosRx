import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { servicesMock } = vi.hoisted(() => ({ servicesMock: vi.fn() }));
vi.mock("@/lib/api/storefront-services", () => ({ getStorefrontServices: servicesMock }));

import { StorefrontServices } from "@/components/storefront/storefront-services";
import { StorefrontI18nProvider } from "@/components/storefront/storefront-i18n-provider";

const renderServices = () =>
  render(
    <StorefrontI18nProvider defaultLocale="en" enabledLocales={["en"]}>
      <StorefrontServices storeSlug="salon" currency="XAF" whatsapp="+237 677 000 000" />
    </StorefrontI18nProvider>,
  );

describe("storefront services", () => {
  afterEach(() => vi.clearAllMocks());

  it("lists each service with its price and a WhatsApp enquiry link", async () => {
    servicesMock.mockResolvedValue([{ id: "s1", name: "Braiding", description: "Box braids", category: "Hair", price: 15000 }]);
    renderServices();

    expect(await screen.findByRole("heading", { name: "Braiding" })).toBeInTheDocument();
    expect(screen.getByText("Box braids")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /enquire on whatsapp/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/237677000000?text="));
  });

  it("renders nothing when the store has no services", async () => {
    servicesMock.mockResolvedValue([]);
    const { container } = renderServices();

    await vi.waitFor(() => expect(servicesMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
