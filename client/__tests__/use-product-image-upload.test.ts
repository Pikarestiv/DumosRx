import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const UPLOAD_URL = "https://incoming.example.test/put-here?sig=1";
const NEW_KEY = "stores/s1/products/p1/new.webp";

type Route = { status: number; body?: unknown };

function stubNetwork(routes: Record<string, Route>) {
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url });
    const match = Object.entries(routes).find(([pattern]) => `${method} ${url}`.includes(pattern));
    const route = match?.[1] ?? { status: 404, body: { message: "not found" } };
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    });
  }));
  return calls;
}

function stubCanvas() {
  vi.stubGlobal("createImageBitmap", async () => ({ width: 1024, height: 768, close: () => {} }));
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return realCreate(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob([new Uint8Array(50_000)], { type })),
    } as unknown as HTMLElement;
  });
}

function photo(type = "image/jpeg", size = 2000) {
  return new File([new Uint8Array(size)], "photo.jpg", { type });
}

describe("useProductImageUpload", () => {
  let db: Database;
  let useProductImageUpload: typeof import("@/lib/hooks/use-product-image-upload").useProductImageUpload;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ useProductImageUpload } = await import("@/lib/hooks/use-product-image-upload"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM products; DELETE FROM _sync_queue;");
    db.run("INSERT INTO products (id, name, image_key, _version) VALUES ('p1', 'panadol', 'stores/s1/products/p1/old.webp', 3)");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    stubCanvas();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function imageKey(): unknown {
    return db.exec("SELECT image_key FROM products WHERE id = 'p1'")[0].values[0][0];
  }

  it("compresses, presigns, uploads to storage, confirms, then stores the new key locally without queueing a push", async () => {
    const calls = stubNetwork({
      "/image/presign": { status: 200, body: { key: NEW_KEY, upload_url: UPLOAD_URL, headers: { "Content-Type": "image/webp" }, expires_at: "" } },
      [`PUT ${UPLOAD_URL}`]: { status: 200 },
      "/image/confirm": { status: 200, body: { id: "p1", image_key: NEW_KEY, image_url: `https://img/${NEW_KEY}` } },
    });
    const { result } = renderHook(() => useProductImageUpload("p1"));

    let ok = false;
    await act(async () => {
      ok = await result.current.upload(photo());
    });

    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(imageKey()).toBe(NEW_KEY);
    expect(db.exec("SELECT COUNT(*) FROM _sync_queue")[0].values[0][0]).toBe(0);
    expect(calls.map((c) => c.method + " " + (c.url.includes("presign") ? "presign" : c.url.includes("confirm") ? "confirm" : c.url))).toEqual([
      "POST presign",
      `PUT ${UPLOAD_URL}`,
      "POST confirm",
    ]);
  });

  it("refuses offline with a clear message and makes no request", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const calls = stubNetwork({});
    const { result } = renderHook(() => useProductImageUpload("p1"));

    await act(async () => {
      await result.current.upload(photo());
    });

    expect(result.current.error).toMatch(/offline/i);
    expect(calls).toHaveLength(0);
    expect(imageKey()).toBe("stores/s1/products/p1/old.webp");
  });

  it("rejects a non-image before any request", async () => {
    const calls = stubNetwork({});
    const { result } = renderHook(() => useProductImageUpload("p1"));

    await act(async () => {
      await result.current.upload(photo("application/pdf"));
    });

    expect(result.current.error).toMatch(/not an image/);
    expect(calls).toHaveLength(0);
  });

  it("keeps the old image when the storage upload fails, and never confirms", async () => {
    const calls = stubNetwork({
      "/image/presign": { status: 200, body: { key: NEW_KEY, upload_url: UPLOAD_URL, headers: {}, expires_at: "" } },
      [`PUT ${UPLOAD_URL}`]: { status: 403 },
    });
    const { result } = renderHook(() => useProductImageUpload("p1"));

    await act(async () => {
      await result.current.upload(photo());
    });

    expect(result.current.error).toMatch(/could not be uploaded/);
    expect(calls.some((c) => c.url.includes("/confirm"))).toBe(false);
    expect(imageKey()).toBe("stores/s1/products/p1/old.webp");
  });

  it("surfaces a permission refusal from the server", async () => {
    stubNetwork({ "/image/presign": { status: 403, body: { message: "Forbidden" } } });
    const { result } = renderHook(() => useProductImageUpload("p1"));

    await act(async () => {
      await result.current.upload(photo());
    });

    expect(result.current.error).toMatch(/permission/);
  });

  it("removes the image on the server first, then clears it locally", async () => {
    stubNetwork({ "DELETE": { status: 200, body: { id: "p1", image_key: null, image_url: null } } });
    const { result } = renderHook(() => useProductImageUpload("p1"));

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.error).toBeNull();
    expect(imageKey()).toBeNull();
  });

  it("keeps the image locally when the server refuses the removal", async () => {
    stubNetwork({ "DELETE": { status: 500, body: { message: "boom" } } });
    const { result } = renderHook(() => useProductImageUpload("p1"));

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.error).not.toBeNull();
    expect(imageKey()).toBe("stores/s1/products/p1/old.webp");
  });
});
