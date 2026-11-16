import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type FakeRequest = { method: string; destination: string; url: string };

interface Internals {
  isProductImageRequest: (request: FakeRequest) => boolean;
  productImageEvictions: <T>(cachedUrls: T[], limit: number) => T[];
  PRODUCT_IMAGE_CACHE: string;
}

describe("service worker product image cache", () => {
  let sw: Internals;
  let activateHandler: () => Promise<void>;
  const deletedCaches: string[] = [];

  beforeAll(() => {
    const source = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");
    const handlers: Record<string, (event: unknown) => void> = {};
    const stubSelf = {
      addEventListener: (name: string, fn: (event: unknown) => void) => {
        handlers[name] = fn;
      },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
      location: { origin: "https://app.dumosrx.test" },
    } as Record<string, unknown>;
    const stubCaches = {
      keys: async () => ["dumosrx-v4", "dumosrx-product-images-v1", "dumosrx-v3"],
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
    };
    const stubFetch = async () => ({ ok: false });
    sw = new Function("self", "caches", "fetch", `${source}\nreturn self.__swInternals;`)(
      stubSelf,
      stubCaches,
      stubFetch,
    ) as Internals;
    activateHandler = () =>
      new Promise((done) => {
        handlers.activate({ waitUntil: (p: Promise<void>) => p.then(() => done()) });
      });
  });

  const image = (url: string, destination = "image", method = "GET") => ({ url, destination, method });

  it("recognises a product image on the CDN origin", () => {
    expect(sw.isProductImageRequest(image("https://img.dumosrx.test/stores/s1/products/p1/0f8b.webp"))).toBe(true);
    expect(sw.isProductImageRequest(image("https://img.dumosrx.test/stores/s1/products/p1/0f8b.jpg"))).toBe(true);
  });

  it("ignores everything else: API calls, other images, non-GET, non-image destinations", () => {
    expect(sw.isProductImageRequest(image("https://api.dumosrx.test/api/v1/app/products/p1/image", "", "GET"))).toBe(false);
    expect(sw.isProductImageRequest(image("https://app.dumosrx.test/icons/logo.png"))).toBe(false);
    expect(sw.isProductImageRequest(image("https://img.dumosrx.test/stores/s1/products/p1/x.webp", "image", "PUT"))).toBe(false);
    expect(sw.isProductImageRequest(image("https://img.dumosrx.test/stores/s1/products/p1/x.webp", "script"))).toBe(false);
    expect(sw.isProductImageRequest(image("https://img.dumosrx.test/stores/s1/products/p1/x.svg"))).toBe(false);
  });

  it("evicts the oldest entries beyond the limit and nothing under it", () => {
    expect(sw.productImageEvictions(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
    expect(sw.productImageEvictions(["a", "b"], 2)).toEqual([]);
    expect(sw.productImageEvictions([], 500)).toEqual([]);
  });

  it("survives activation, which drops every other non-current cache", async () => {
    await activateHandler();

    expect(deletedCaches).toContain("dumosrx-v3");
    expect(deletedCaches).not.toContain(sw.PRODUCT_IMAGE_CACHE);
    expect(deletedCaches).not.toContain("dumosrx-v4");
  });
});
