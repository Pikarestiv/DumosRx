import { describe, expect, it } from "vitest";

import { branchHref, parseStorefrontScope, scopeFromPathname, storefrontScope } from "@/lib/storefront-scope";

describe("storefront scope", () => {
  it("joins and splits a brand and a branch", () => {
    expect(storefrontScope("nestpharmacy", "agidi")).toBe("nestpharmacy/agidi");
    expect(storefrontScope("nestpharmacy")).toBe("nestpharmacy");
    expect(parseStorefrontScope("nestpharmacy/agidi")).toEqual({ slug: "nestpharmacy", branch: "agidi" });
    expect(parseStorefrontScope("nestpharmacy")).toEqual({ slug: "nestpharmacy" });
  });

  it.each([
    ["/s/nestpharmacy", "nestpharmacy"],
    ["/s/nestpharmacy/catalog/", "nestpharmacy"],
    ["/s/nestpharmacy/checkout", "nestpharmacy"],
    ["/s/nestpharmacy/agidi", "nestpharmacy/agidi"],
    ["/s/nestpharmacy/agidi/catalog/", "nestpharmacy/agidi"],
    ["/s/nestpharmacy/agidi/checkout", "nestpharmacy/agidi"],
  ])("reads the scope of %s", (pathname, scope) => {
    expect(scopeFromPathname(pathname)).toBe(scope);
  });

  it("has no scope outside a storefront", () => {
    expect(scopeFromPathname("/admin/stores")).toBeNull();
    expect(scopeFromPathname(null)).toBeNull();
  });

  it("links a branch beneath the brand, and the primary branch to the brand's front door", () => {
    expect(branchHref("nestpharmacy", { slug: "agidi" })).toBe("/s/nestpharmacy/agidi");
    expect(branchHref("nestpharmacy/agidi", { slug: "agidi" }, "catalog")).toBe("/s/nestpharmacy/agidi/catalog");
    expect(branchHref("nestpharmacy/agidi", { slug: "amawbia", is_primary: true }, "catalog")).toBe("/s/nestpharmacy/catalog");
    expect(branchHref("nestpharmacy", {})).toBe("/s/nestpharmacy");
  });
});
