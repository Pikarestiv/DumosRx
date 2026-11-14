import { describe, expect, it } from "vitest";

import { storefrontUrl } from "@/lib/utils/storefront-url";

describe("storefrontUrl", () => {
  it("adds https to the production base, which is configured without a scheme", () => {
    expect(storefrontUrl("dumosrx.com/store", "divamax")).toBe("https://dumosrx.com/store/divamax");
  });

  it("keeps a scheme that is already there and ignores a trailing slash", () => {
    expect(storefrontUrl("https://shop.example/", "a")).toBe("https://shop.example/a");
  });

  it("uses http for a local address, which has no certificate", () => {
    expect(storefrontUrl("localhost:3000/store", "pikalocal")).toBe("http://localhost:3000/store/pikalocal");
    expect(storefrontUrl("127.0.0.1:3000/store", "x")).toBe("http://127.0.0.1:3000/store/x");
  });
});
