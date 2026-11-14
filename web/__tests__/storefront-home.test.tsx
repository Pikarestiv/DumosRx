import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import StorefrontLayout from "@/app/store/[store_slug]/layout";
import StorefrontPage from "@/app/store/[store_slug]/page";
import type { StorefrontData } from "@/lib/api/storefront-data";


vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/store/grace",
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

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const productsPage = (data: StorefrontData) => ({ data: data.products, meta: { current_page: 1, last_page: 1, total: data.products.length } });

function serveStorefront(data: StorefrontData) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => Promise.resolve(json(String(url).includes("/products") ? productsPage(data) : data))),
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

    const featured = screen.getByRole("region", { name: "Products" });
    expect(within(featured).getAllByRole("button", { name: /^add to cart:/i })).toHaveLength(8);
    expect(screen.getByRole("link", { name: /view all 20 products/i }).getAttribute("href")).toBe("/store/grace/catalog");
  });

  it("filters the grid by category chip without leaving the page", async () => {
    const products = productList(6).map((p, i) => ({ ...p, category: { name: i < 2 ? "Lighting" : "Tools" } }));
    await renderHome(storefrontData({ products, product_count: 6 }));

    expect(screen.getByRole("button", { name: "All · 6" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Lighting" }));

    const featured = screen.getByRole("region", { name: "Products" });
    expect(within(featured).getAllByRole("button", { name: /^add to cart:/i })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "All · 6" }));
    expect(within(featured).getAllByRole("button", { name: /^add to cart:/i })).toHaveLength(6);
  });

  it("gives every priced card one add button, and disables it once live stock says the product is out", async () => {
    const products = [
      { id: "a", name: "Bulb", selling_price: 1500, stock_quantity: 40, in_stock: true },
      { id: "b", name: "Lamp", selling_price: 2500, stock_quantity: 0, in_stock: false },
    ];
    await renderHome(storefrontData({ products }));

    expect(await screen.findByText("Out of stock")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to cart: Bulb" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Add to cart: Lamp" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("In stock")).toBeTruthy();
  });

  it("says only N left at five or fewer, once live stock arrives", async () => {
    await renderHome(storefrontData({ products: [{ id: "a", name: "Bulb", selling_price: 1500, stock_quantity: 3 }] }));

    expect(await screen.findByText("Only 3 left")).toBeTruthy();
  });

  it("never trusts the stock baked in at build time: nothing is disabled or labelled until the live list arrives", async () => {
    const built = storefrontData({ products: [{ id: "a", name: "Lamp", selling_price: 2500, stock_quantity: 0, in_stock: false }] });
    const fetchMock = vi.fn().mockResolvedValueOnce(json(built)).mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(await StorefrontPage({ params }));

    expect((screen.getByRole("button", { name: "Add to cart: Lamp" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Out of stock")).toBeNull();
  });

  it("re-enables a product the live list says is back in stock, and shows its current price", async () => {
    const built = storefrontData({ products: [{ id: "a", name: "Lamp", selling_price: 2500, stock_quantity: 0, in_stock: false }] });
    const live = storefrontData({ products: [{ id: "a", name: "Lamp", selling_price: 2800, stock_quantity: 12, in_stock: true }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(built)).mockResolvedValue(json(productsPage(live))));

    render(await StorefrontPage({ params }));

    expect(await screen.findByText("In stock")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to cart: Lamp" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("₦2,800")).toBeTruthy();
  });

  it("refreshes only the products already on the page, by id, and keeps their order", async () => {
    const built = storefrontData({
      products: [
        { id: "a", name: "Alpha", selling_price: 100 },
        { id: "b", name: "Bravo", selling_price: 200 },
      ],
    });
    const live = storefrontData({
      products: [
        { id: "b", name: "Bravo", selling_price: 250, stock_quantity: 9 },
        { id: "a", name: "Alpha", selling_price: 120, stock_quantity: 9 },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(json(built)).mockResolvedValue(json(productsPage(live)));
    vi.stubGlobal("fetch", fetchMock);

    render(await StorefrontPage({ params }));
    await screen.findAllByText("In stock");

    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/products\?.*ids=a%2Cb/);
    const names = within(screen.getByRole("region", { name: "Products" })).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Alpha", "Bravo"]);
    expect(screen.getByText("₦120")).toBeTruthy();
  });

  it("drops a product the live list no longer offers", async () => {
    const built = storefrontData({ products: [{ id: "a", name: "Alpha", selling_price: 100 }, { id: "b", name: "Bravo", selling_price: 200 }] });
    const live = storefrontData({ products: [{ id: "a", name: "Alpha", selling_price: 100, stock_quantity: 9 }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(built)).mockResolvedValue(json(productsPage(live))));

    render(await StorefrontPage({ params }));
    await screen.findByText("In stock");

    expect(screen.queryByText("Bravo")).toBeNull();
  });

  it("ignores a live answer from an older API that did not honour the ids, instead of dropping products", async () => {
    const built = storefrontData({ products: [{ id: "a", name: "Alpha", selling_price: 100 }, { id: "b", name: "Bravo", selling_price: 200 }] });
    const ignoringIds = storefrontData({ products: [{ id: "zzz", name: "Unrelated", selling_price: 1, stock_quantity: 9 }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(built)).mockResolvedValue(json(productsPage(ignoringIds))));

    render(await StorefrontPage({ params }));
    await act(async () => {});

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.queryByText("Unrelated")).toBeNull();
  });

  it("shows Price on request, never a zero price, and offers Ask on WhatsApp only when a number is set", async () => {
    const unpriced = [{ id: "a", name: "Face Cream", selling_price: 0 }];
    const withNumber = await renderHome(
      storefrontData({
        products: unpriced,
        storefront: { id: "f1", slug: "grace", name: "Grace", whatsapp: "+234 800 000 0000" },
      }),
    );

    expect(screen.getByText("Price on request")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add to cart/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/₦\s?0(?![\d,])/);
    const ask = screen.getByRole("link", { name: /ask about the price of face cream/i });
    expect(ask.getAttribute("href")).toBe("https://wa.me/2348000000000?text=Hi%2C%20how%20much%20is%20Face%20Cream%3F");
    withNumber.unmount();

    await renderHome(storefrontData({ products: unpriced }));
    expect(screen.getByText("Price on request")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ask about the price/i })).toBeNull();
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

    expect(screen.getByText(/no products are available online yet/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /view all/i })).toBeNull();
  });

  it("leads with the owner's tagline, then the headline, then the default for the store type", async () => {
    const withTagline = await renderHome(
      storefrontData({ storefront: { id: "f1", slug: "grace", name: "Grace", headline: "Old headline", tagline: "Wiring, lighting, done." } }),
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wiring, lighting, done.");
    withTagline.unmount();

    const headlineOnly = await renderHome(storefrontData());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Care you can trust");
    headlineOnly.unmount();

    await renderHome(storefrontData({ storefront: { id: "f1", slug: "grace", name: "Grace" } }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Medicines, wellness and everyday essentials.");
  });

  it("no longer carries the generic template sections", async () => {
    const { container } = await renderHome(storefrontData());

    expect(screen.queryByText(/genuine products, ready when you are/i)).toBeNull();
    expect(screen.queryByText(/fast pickup & delivery/i)).toBeNull();
    for (const id of ["about", "faq", "locations", "contact"]) {
      expect(container.querySelector(`section#${id}`)).toBeNull();
    }
  });

  it("explains ordering in three numbered steps worded for the store type", async () => {
    const pharmacy = await renderHome(storefrontData());
    const steps = within(screen.getByRole("region", { name: "How ordering works" })).getAllByRole("listitem");
    expect(steps.map((step) => within(step).getByRole("heading").textContent)).toEqual(["Choose", "Pay", "Collect"]);
    expect(screen.getByText(/prescription items need a valid prescription/i)).toBeTruthy();
    pharmacy.unmount();

    await renderHome(storefrontData({ store: { id: "s1", name: "Grace Hardware", currency: "NGN", store_type: "retail" } }));
    expect(screen.queryByText(/prescription/i)).toBeNull();
  });

  it("offers WhatsApp only when the store has a number, linking wa.me with digits only", async () => {
    const without = await renderHome(storefrontData());
    expect(screen.queryByRole("link", { name: /whatsapp/i })).toBeNull();
    without.unmount();

    await renderHome(
      storefrontData({ storefront: { id: "f1", slug: "grace", name: "Grace", whatsapp: "+237 6 00 00 00 00" } }),
    );
    const links = screen.getAllByRole("link", { name: /whatsapp/i });
    expect(links[0].getAttribute("href")).toBe("https://wa.me/237600000000");
  });

  it("shows the store information panel on the workshop preset, hiding any row with no value", async () => {
    await renderHome(
      storefrontData({
        store: { id: "s1", name: "Grace Hardware", phone: "0801", address: "12 Allen Avenue", currency: "NGN", store_type: "retail" },
        storefront: {
          id: "f1", slug: "grace", name: "Grace", theme: "workshop", pickup_minutes: 20,
          opening_hours: { mon: { open: "08:00", close: "18:00" } },
        },
      }),
    );

    const panel = screen.getByRole("complementary", { name: "Store information" });
    expect(within(panel).getByText("12 Allen Avenue")).toBeTruthy();
    expect(within(panel).getByText("Mon · 8:00 am – 6:00 pm")).toBeTruthy();
    expect(within(panel).getByText("0801")).toBeTruthy();
    expect(within(panel).getByText("Ready in about 20 min")).toBeTruthy();
  });

  it("leaves out the information panel rows the store has not filled in", async () => {
    await renderHome(
      storefrontData({
        store: { id: "s1", name: "Grace Hardware", currency: "NGN", store_type: "retail" },
        storefront: { id: "f1", slug: "grace", name: "Grace", theme: "workshop" },
      }),
    );

    const panel = screen.getByRole("complementary", { name: "Store information" });
    for (const label of ["Address", "Hours", "Phone", "Pickup"]) {
      expect(within(panel).queryByText(label)).toBeNull();
    }
    expect(within(panel).getByText("Payment")).toBeTruthy();
  });

  it("has no header nav and never links Upload Rx or Track Order", async () => {
    await renderHome(storefrontData());

    expect(screen.queryByRole("navigation", { name: "Store" })).toBeNull();
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

  it("styles a pharmacy on the clinic preset until an admin assigns another", async () => {
    serveStorefront(
      storefrontData({
        store: { id: "s1", name: "Grace Pharmacy", currency: "NGN", store_type: "pharmacy" },
        storefront: { id: "f1", slug: "grace", name: "Grace", theme: "emerald" },
      }),
    );
    const { container } = render(await StorefrontLayout({ params, children: <p>page</p> }));

    expect(container.querySelector("[data-storefront-preset]")?.getAttribute("data-storefront-preset")).toBe("clinic");
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain('font-family:"Figtree"');
    expect(css).not.toContain("@font-face{font-family:\"Archivo\"");
  });

  it("applies the store's own accent colour over the preset's", async () => {
    serveStorefront(
      storefrontData({ storefront: { id: "f1", slug: "grace", name: "Grace", theme: "workshop", accent: "#2255AA" } }),
    );
    const { container } = render(await StorefrontLayout({ params, children: <p>page</p> }));

    expect(container.querySelector("style")?.textContent).toContain("--primary:#2255AA;");
  });
});

describe("a French storefront", () => {
  afterEach(() => vi.unstubAllGlobals());

  const frenchStore = () =>
    storefrontData({
      store: { id: "s1", name: "Divamax", currency: "XAF", store_type: "retail", phone: "699000000", online_payment_available: true },
      storefront: {
        id: "f1", slug: "grace", name: "Divamax", theme: "workshop", locale: "fr", enabled_locales: ["fr", "en"],
        whatsapp: "+237 6 00 00 00 00", opening_hours: { mon: { open: "08:00", close: "18:00" } },
      },
      products: [
        { id: "a", name: "Ampoule", selling_price: 1500, stock_quantity: 3, category: { name: "Éclairage" } },
        { id: "b", name: "Mèche", selling_price: 0 },
      ],
      product_count: 2,
    });

  async function renderFrench() {
    serveStorefront(frenchStore());
    const layout = await StorefrontLayout({ params, children: await StorefrontPage({ params }) });
    return render(layout);
  }

  it("shows French text, prices and times, and none of the English strings", async () => {
    const { container } = await renderFrench();
    await screen.findByText("Plus que 3");
    const text = container.textContent ?? "";

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tout ce qu'il vous faut, prêt au retrait.");
    expect(screen.getByRole("link", { name: "Voir les articles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajouter au panier : Ampoule" })).toBeTruthy();
    expect(text.replace(/\s/g, " ")).toContain("1 500 FCFA");
    expect(text).toContain("Plus que 3");
    expect(text).toContain("Prix sur demande");
    expect(text).toContain("08h00 – 18h00");
    for (const english of ["Browse products", "Add to cart", "Price on request", "How ordering works", "Powered by", "Store pickup", "items", "In stock", "Only 3 left"]) {
      expect(text, `English text leaked: ${english}`).not.toContain(english);
    }
  });

  it("offers the language switch because the store enabled two languages", async () => {
    await renderFrench();

    expect(screen.getByRole("group", { name: "Langue" })).toBeTruthy();
  });

  it("asks about a price in French on WhatsApp", async () => {
    await renderFrench();

    const ask = screen.getByRole("link", { name: "Demander le prix de Mèche" });
    expect(decodeURIComponent(ask.getAttribute("href") ?? "")).toContain("Bonjour, quel est le prix de Mèche ?");
  });
});
