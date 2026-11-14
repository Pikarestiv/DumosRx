import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { StorefrontCatalogView } from "@/components/storefront/storefront-catalog-view";
import type { PaginatedStorefrontProducts } from "@/lib/api/storefront-data";
import type { StorefrontProduct } from "@/lib/types/storefront";


const product = (id: string, name: string, category: string, price = 250): StorefrontProduct => ({
  id,
  name,
  selling_price: price,
  category: { name: category },
});

const CATEGORIES = [
  { id: "c1", name: "Pain Relief", count: 1 },
  { id: "c2", name: "Antibiotics", count: 1 },
];

const page = (data: StorefrontProduct[], current = 1, last = 1, total = data.length): PaginatedStorefrontProducts => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: current, from: 1, last_page: last, path: "/products", per_page: 48, to: data.length, total },
  categories: CATEGORIES,
});

const PARACETAMOL = product("p1", "PARACETAMOL 500MG", "Pain Relief");
const AMOXIL = product("p2", "AMOXIL CAP", "Antibiotics", 1200);
const initial = page([PARACETAMOL, AMOXIL], 1, 2, 52);

type Responder = (params: URLSearchParams) => PaginatedStorefrontProducts | number;
let respond: Responder;
let fetchMock: ReturnType<typeof vi.fn>;

const requested = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams);
const lastRequest = () => requested()[requested().length - 1];

function renderCatalog(data: PaginatedStorefrontProducts | null = initial) {
  return render(<StorefrontCatalogView storeSlug="grace" currency="NGN" whatsapp={null} initialData={data} />);
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe("StorefrontCatalogView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/store/grace/catalog/");
    localStorage.clear();
    respond = () => initial;
    fetchMock = vi.fn((url: string) => {
      const result = respond(new URL(String(url)).searchParams);
      return Promise.resolve(
        typeof result === "number" ? new Response("{}", { status: result }) : new Response(JSON.stringify(result)),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the build-time products at once, with title-casing and prices", () => {
    renderCatalog();

    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
    expect(screen.getByText("Amoxil Cap")).toBeTruthy();
    expect(screen.getByText("₦250")).toBeTruthy();
    expect(screen.getByText("52 products")).toBeTruthy();
  });

  it("refreshes the list from the API on load so prices and stock are never the build-time ones", async () => {
    respond = () => page([{ ...PARACETAMOL, selling_price: 300 }], 1, 1, 1);
    renderCatalog();
    await settle();

    expect(screen.getByText("₦300")).toBeTruthy();
    expect(screen.queryByText("₦250")).toBeNull();
  });

  it("lists categories with their counts in the sidebar and as chips", async () => {
    renderCatalog();
    await settle();

    const sidebar = screen.getByRole("navigation", { name: "Categories" });
    expect(within(sidebar).getByRole("button", { name: /Pain Relief/ }).textContent).toContain("1");
    expect(within(sidebar).getByRole("button", { name: /All products/ }).textContent).toContain("52");
    const chips = screen.getByRole("group", { name: "Categories" });
    expect(within(chips).getByRole("button", { name: "Antibiotics" })).toBeTruthy();
  });

  it("searches as the user types, once typing pauses, with no Search button", async () => {
    renderCatalog();
    await settle();
    fetchMock.mockClear();
    respond = (params) => (params.get("q") === "amox" ? page([AMOXIL], 1, 1, 1) : initial);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), { target: { value: "am" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), { target: { value: "amox" } });
    expect(fetchMock).not.toHaveBeenCalled();
    await settle();

    expect(requested().map((p) => p.get("q"))).toEqual(["amox"]);
    expect(screen.queryByText("Paracetamol 500MG")).toBeNull();
    expect(screen.getByText("Amoxil Cap")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^search$/i })).toBeNull();
  });

  it("opens with the term from the header search box already applied", async () => {
    window.history.replaceState({}, "", "/store/grace/catalog/?q=amox");
    respond = (params) => (params.get("q") === "amox" ? page([AMOXIL], 1, 1, 1) : initial);
    renderCatalog();
    await settle();

    expect((screen.getByRole("searchbox", { name: "Search products" }) as HTMLInputElement).value).toBe("amox");
    expect(screen.queryByText("Paracetamol 500MG")).toBeNull();
  });

  it("filters by category through the API", async () => {
    renderCatalog();
    await settle();
    respond = (params) => (params.get("category") === "c2" ? page([AMOXIL], 1, 1, 1) : initial);

    fireEvent.click(within(screen.getByRole("navigation", { name: "Categories" })).getByRole("button", { name: /Antibiotics/ }));
    await settle();

    expect(lastRequest().get("category")).toBe("c2");
    expect(screen.queryByText("Paracetamol 500MG")).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Categories" })).getByRole("button", { name: /Antibiotics/, pressed: true })).toBeTruthy();
  });

  it("loads the next page onto the end of the list, without repeating a product", async () => {
    renderCatalog();
    await settle();
    respond = (params) =>
      params.get("page") === "2" ? page([AMOXIL, product("p3", "ZINC TABLETS", "Pain Relief")], 2, 2, 52) : initial;

    fireEvent.click(screen.getByRole("button", { name: "Load more products" }));
    await settle();

    expect(screen.getAllByText("Amoxil Cap")).toHaveLength(1);
    expect(screen.getByText("Zinc Tablets")).toBeTruthy();
    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more products" })).toBeNull();
  });

  it("shows an empty state with a way back to everything", async () => {
    renderCatalog();
    await settle();
    respond = (params) => (params.get("q") === "zzz" ? page([], 1, 1, 0) : initial);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), { target: { value: "zzz" } });
    await settle();
    expect(screen.getByText("No products found")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await settle();
    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
  });

  it("keeps the products on screen when a refresh fails, and recovers on retry", async () => {
    renderCatalog();
    await settle();
    respond = () => 500;

    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), { target: { value: "x" } });
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("couldn't load the products");
    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();

    respond = () => page([AMOXIL], 1, 1, 1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Amoxil Cap")).toBeTruthy();
  });

  it("shows Price on request for an unpriced product and offers Ask when a WhatsApp number is passed", async () => {
    respond = () => page([product("p9", "Face Cream", "Creams", 0)], 1, 1, 1);
    render(<StorefrontCatalogView storeSlug="grace" currency="NGN" whatsapp="+234 800 000 0000" initialData={respond(new URLSearchParams()) as PaginatedStorefrontProducts} />);

    expect(screen.getByText("Price on request")).toBeTruthy();
    expect(screen.getByRole("link", { name: /ask about the price of face cream/i }).getAttribute("href")).toContain("wa.me/2348000000000");
  });

  it("shows placeholders instead of an empty state while the first load is under way", async () => {
    renderCatalog(null);

    expect(screen.getByRole("status", { name: "Loading products" })).toBeTruthy();
    expect(screen.queryByText("No products found")).toBeNull();
    await settle();
    expect(screen.queryByRole("status", { name: "Loading products" })).toBeNull();
    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
  });

  it("leaves out the category sidebar and chips when the store has no categories", async () => {
    respond = () => ({ ...initial, categories: [] });
    renderCatalog({ ...initial, categories: [] });
    await settle();

    expect(screen.queryByRole("navigation", { name: "Categories" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Categories" })).toBeNull();
    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
  });

  it("does not trust the stock baked in at build time: no hint and no disabled button until the live list arrives", async () => {
    const soldOut = { ...PARACETAMOL, stock_quantity: 0, in_stock: false };
    respond = () => page([{ ...PARACETAMOL, stock_quantity: 9, in_stock: true }], 1, 1, 1);
    renderCatalog(page([soldOut], 1, 1, 1));

    expect(screen.queryByText("Out of stock")).toBeNull();
    expect((screen.getByRole("button", { name: /add to cart: paracetamol/i }) as HTMLButtonElement).disabled).toBe(false);

    await settle();
    expect(screen.getByText("In stock")).toBeTruthy();
  });

  it("shows out of stock once the live list says so", async () => {
    respond = () => page([{ ...PARACETAMOL, stock_quantity: 0, in_stock: false }], 1, 1, 1);
    renderCatalog();
    await settle();

    expect(screen.getByText("Out of stock")).toBeTruthy();
    expect((screen.getByRole("button", { name: /add to cart: paracetamol/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps stock hidden if the first refresh failed and only a later page loaded", async () => {
    const soldOut = { ...PARACETAMOL, stock_quantity: 0, in_stock: false };
    respond = (params) => (params.get("page") === "2" ? page([{ ...AMOXIL, stock_quantity: 5, in_stock: true }], 2, 2, 52) : 500);
    renderCatalog(page([soldOut], 1, 2, 52));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Load more products" }));
    await settle();

    expect(screen.queryByText("Out of stock")).toBeNull();
    expect((screen.getByRole("button", { name: /add to cart: paracetamol/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
