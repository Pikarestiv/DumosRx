import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import StorefrontLayout from "@/app/store/[store_slug]/layout";
import StorefrontPage from "@/app/store/[store_slug]/page";
import type { StorefrontData } from "@/lib/api/storefront-data";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const productList = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Product ${i}`, selling_price: 100 + i }));

const storefrontData = (overrides: Partial<StorefrontData> = {}): StorefrontData => ({
  store: { id: "s1", name: "Grace Pharmacy", phone: "0801", email: "hi@grace.test", currency: "NGN" },
  storefront: { id: "f1", slug: "grace", name: "Grace Pharmacy", headline: "Care you can trust", theme: "navy" },
  branches: [{ id: "s1", name: "Grace Pharmacy", is_primary: true }],
  products: productList(20),
  ...overrides,
});

function serveStorefront(data: StorefrontData) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }))),
  );
}

const params = Promise.resolve({ store_slug: "grace" });

async function renderHome(data: StorefrontData) {
  serveStorefront(data);
  return render(await StorefrontPage({ params }));
}

describe("storefront home page", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("features only eight products and links to the shop with the full count", async () => {
    await renderHome(storefrontData());

    const featured = screen.getByRole("region", { name: "Featured products" });
    expect(within(featured).getAllByRole("button", { name: /add to cart/i })).toHaveLength(8);
    expect(screen.getByRole("link", { name: /view all 20 products/i }).getAttribute("href")).toBe("/store/grace/catalog");
  });

  it("shows four featured products on a phone and all eight from the sm breakpoint up", async () => {
    await renderHome(storefrontData());

    const featured = screen.getByRole("region", { name: "Featured products" });
    const cards = Array.from(featured.querySelectorAll("[data-slot='card'], .rounded-xl.border")).filter((el) =>
      el.querySelector("button"),
    );
    expect(cards).toHaveLength(8);
    expect(cards.slice(0, 4).every((c) => !c.className.includes("hidden"))).toBe(true);
    expect(cards.slice(4).every((c) => c.className.includes("hidden sm:flex"))).toBe(true);
  });

  it("gives each card a compact add button for phones beside the full-width one for larger screens", async () => {
    await renderHome(storefrontData({ products: productList(1) }));

    const featured = screen.getByRole("region", { name: "Featured products" });
    const buttons = within(featured).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons.some((b) => b.className.includes("sm:hidden") && /^Add /.test(b.getAttribute("aria-label") ?? ""))).toBe(true);
    expect(buttons.some((b) => /add to cart/i.test(b.textContent ?? ""))).toBe(true);
  });

  it("shows every product and still offers the shop when the store has fewer than eight", async () => {
    await renderHome(storefrontData({ products: productList(3) }));

    expect(screen.getAllByRole("button", { name: /add to cart/i })).toHaveLength(3);
    expect(screen.getByRole("link", { name: /view all 3 products/i })).toBeTruthy();
  });

  it("counts every listed product, not just the capped landing list", async () => {
    await renderHome(storefrontData({ products: productList(50), product_count: 128 }));

    expect(screen.getByRole("link", { name: /view all 128 products/i })).toBeTruthy();
  });

  it("drops the number when an older API omits the count and the list hit the cap", async () => {
    await renderHome(storefrontData({ products: productList(50) }));

    const link = screen.getByRole("link", { name: /view all/i });
    expect(link.textContent?.trim()).toBe("View all products");
  });

  it("drops the product grid and its shop button when nothing is listed", async () => {
    await renderHome(storefrontData({ products: [] }));

    expect(screen.getByText(/no products are currently available online/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /view all/i })).toBeNull();
  });

  it("puts the headline, About, FAQ and Contact sections on the home page under their anchors", async () => {
    const { container } = await renderHome(storefrontData());

    expect(screen.getByRole("heading", { name: "Care you can trust" })).toBeTruthy();
    for (const id of ["about", "faq", "contact"]) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
    expect(within(container.querySelector("section#contact") as HTMLElement).getByText("0801")).toBeTruthy();
  });

  it("drops the Contact section, nav link and hero button for a store with no contact details", async () => {
    await renderHome(storefrontData({ store: { id: "s1", name: "Grace Pharmacy", currency: "NGN" } }));

    expect(screen.queryByRole("region", { name: "Contact" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Store" });
    expect(within(nav).queryByRole("link", { name: "Contact" })).toBeNull();
    expect(screen.queryByRole("link", { name: /contact us/i })).toBeNull();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).queryByText("Contact")).toBeNull();
  });

  it("keeps the Contact section and nav link once the store has a phone", async () => {
    await renderHome(storefrontData({ store: { id: "s1", name: "Grace Pharmacy", phone: "0801", currency: "NGN" } }));

    expect(within(screen.getByRole("region", { name: "Contact" })).getByText("0801")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Store" });
    expect(within(nav).getByRole("link", { name: "Contact" }).getAttribute("href")).toBe("/store/grace#contact");
  });

  it("omits Locations for a single branch with no address, and shows it once there is one", async () => {
    const { container, unmount } = await renderHome(storefrontData());
    expect(container.querySelector("section#locations")).toBeNull();
    unmount();

    const withAddress = storefrontData();
    withAddress.store.address = "12 Allen Avenue";
    const second = await renderHome(withAddress);
    expect(second.container.querySelector("section#locations")).not.toBeNull();
  });

  it("navigates with exactly Home, Shop and Contact, and no Upload Rx or Track Order link", async () => {
    await renderHome(storefrontData());

    const nav = screen.getByRole("navigation", { name: "Store" });
    const links = within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Home", "/store/grace"],
      ["Shop", "/store/grace/catalog"],
      ["Contact", "/store/grace#contact"],
    ]);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("/prescription") || href.includes("/track"))).toBe(false);
  });
});

describe("storefront layout theme", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function themeFor(theme: string | undefined) {
    serveStorefront(storefrontData({ storefront: { id: "f1", slug: "grace", name: "Grace", theme } }));
    const { container } = render(await StorefrontLayout({ params, children: <p>page</p> }));
    return container.querySelector("[data-storefront-theme]")?.getAttribute("data-storefront-theme");
  }

  it("marks every storefront route with the store's theme", async () => {
    expect(await themeFor("navy")).toBe("navy");
  });

  it.each([undefined, "neon"])("falls back to the default theme for %s", async (theme) => {
    expect(await themeFor(theme)).toBe("emerald");
  });
});
