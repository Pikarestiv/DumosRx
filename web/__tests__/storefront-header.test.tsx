import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorefrontHeader } from "@/components/storefront/storefront-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const LONG_NAME = "Cutis Aesthetics & Med Spa and Wellness Centre";

describe("StorefrontHeader store name", () => {
  it("wraps a long name to two lines instead of truncating it, and keeps the full name on the home link", () => {
    render(<StorefrontHeader storeSlug="cutis" store={{ id: "s1", name: LONG_NAME }} />);

    const homeLink = screen.getByRole("link", { name: LONG_NAME });
    expect(homeLink.getAttribute("href")).toBe("/store/cutis");
    expect(homeLink.getAttribute("title")).toBe(LONG_NAME);

    const name = screen.getByText(LONG_NAME);
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).not.toContain("truncate");
    expect(name.className).toContain("text-sm");
  });

  it("prefers the storefront profile name and keeps the full size for a short one", () => {
    render(
      <StorefrontHeader
        storeSlug="grace"
        store={{ id: "s1", name: "Grace Ltd" }}
        storefront={{ id: "f1", slug: "grace", name: "Grace Pharmacy" }}
      />,
    );

    expect(screen.getByRole("link", { name: "Grace Pharmacy" })).toBeTruthy();
    expect(screen.getByText("Grace Pharmacy").className).toContain("sm:text-xl");
  });

  it("searches the shop through a plain form, so it works without scripts", () => {
    render(<StorefrontHeader storeSlug="grace" store={{ id: "s1", name: "Grace" }} />);

    const form = screen.getByRole("search");
    expect(form.getAttribute("action")).toBe("/store/grace/catalog");
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getAllByRole("searchbox", { name: "Search products" })[0].getAttribute("name")).toBe("q");
  });

  it("shows the store's initial in place of a missing logo, and the type and location beneath the name", () => {
    render(
      <StorefrontHeader storeSlug="grace" store={{ id: "s1", name: "Grace Hardware", store_type: "retail", location: "Ikeja" }} />,
    );

    expect(screen.getByText("G")).toBeTruthy();
    expect(screen.getByText("Retail store · Ikeja")).toBeTruthy();
  });
});
