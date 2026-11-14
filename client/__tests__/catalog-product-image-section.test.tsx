import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  PRODUCT_IMAGES_DISABLED,
  useProductImageConfigStore,
} from "@/lib/product-images/config-store";

const access = vi.hoisted(() => ({ canManageProducts: true }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => key !== "manage_products" || access.canManageProducts,
}));

import { ProductImageSection } from "@/components/products/product-details/product-image-section";

const KEY = "stores/s1/products/p1/abc.webp";
const ENABLED = { ...PRODUCT_IMAGES_DISABLED, enabled: true, public_base_url: "https://img.example.test" };

function renderSection(imageKey: string | null = KEY) {
  return render(<ProductImageSection productId="p1" productName="panadol extra" imageKey={imageKey} categoryName="Analgesics" />);
}

describe("Catalog detail panel image section", () => {
  let db: Database;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM products");
    db.run(`INSERT INTO products (id, name, image_key) VALUES ('p1', 'panadol extra', '${KEY}')`);
    access.canManageProducts = true;
    useProductImageConfigStore.setState({ config: ENABLED });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is absent while product images are not configured", () => {
    useProductImageConfigStore.setState({ config: PRODUCT_IMAGES_DISABLED });

    renderSection();

    expect(screen.queryByRole("heading", { name: "Image" })).toBeNull();
  });

  it("previews the image with the display-cased product name as alt text", () => {
    renderSection();

    expect(screen.getByRole("img", { name: "Panadol Extra" }).getAttribute("src")).toBe(`https://img.example.test/${KEY}`);
    expect(screen.getByRole("button", { name: /Replace image/ })).toBeTruthy();
    expect(screen.getByLabelText("Choose an image for Panadol Extra").getAttribute("accept")).toBe("image/*");
  });

  it("offers Upload, not Remove, when the product has no image", () => {
    renderSection(null);

    expect(screen.getByRole("button", { name: /Upload image/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove image/ })).toBeNull();
  });

  it("shows the image but no controls without manage_products", () => {
    access.canManageProducts = false;

    renderSection();

    expect(screen.getByRole("img", { name: "Panadol Extra" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Replace image/ })).toBeNull();
  });

  it("disables the controls offline and says why", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    renderSection();

    expect((screen.getByRole("button", { name: /Replace image/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/offline/i);
  });

  it("asks for confirmation before removing, then removes on the server", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "p1", image_key: null, image_url: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /Remove image/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/app/products/p1/image");
    expect(init.method).toBe("DELETE");
    await waitFor(() => expect(db.exec("SELECT image_key FROM products WHERE id = 'p1'")[0].values[0][0]).toBeNull());
  });
});
