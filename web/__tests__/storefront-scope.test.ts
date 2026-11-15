import { describe, expect, it } from "vitest";

import { branchHref, canonicalBranchPath, pageOfPathname, parseStorefrontScope, scopeFromPathname, storefrontScope } from "@/lib/storefront-scope";

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

  it("links every branch beneath the brand, keeping the page the customer is on", () => {
    expect(branchHref("nestpharmacy", { slug: "agidi" })).toBe("/s/nestpharmacy/agidi");
    expect(branchHref("nestpharmacy/agidi", { slug: "agidi" }, "catalog")).toBe("/s/nestpharmacy/agidi/catalog");
    expect(branchHref("nestpharmacy/agidi", { slug: "amawbia" }, "catalog")).toBe("/s/nestpharmacy/amawbia/catalog");
    expect(branchHref("nestpharmacy", {})).toBe("/s/nestpharmacy");
    expect(pageOfPathname("/s/nestpharmacy/agidi/catalog/")).toBe("catalog");
    expect(pageOfPathname("/s/nestpharmacy/agidi")).toBe("");
  });

  it.each([
    ["/s/nestpharmacy", "/s/nestpharmacy/amawbia"],
    ["/s/nestpharmacy/", "/s/nestpharmacy/amawbia/"],
    ["/s/nestpharmacy/catalog", "/s/nestpharmacy/amawbia/catalog"],
    ["/s/nestpharmacy/catalog/", "/s/nestpharmacy/amawbia/catalog/"],
    ["/s/nestpharmacy/checkout", "/s/nestpharmacy/amawbia/checkout"],
    ["/s/nestpharmacy/order/", "/s/nestpharmacy/amawbia/order/"],
  ])("sends the brand-level %s to the main branch at %s", (pathname, target) => {
    expect(canonicalBranchPath(pathname, "nestpharmacy", "amawbia")).toBe(target);
  });

  it.each(["/s/nestpharmacy/agidi", "/s/nestpharmacy/agidi/catalog/", "/s/nestpharmacy/about", "/s/nestpharmacy/faq/", "/s/other/catalog", "/admin/stores"])(
    "leaves %s where it is",
    (pathname) => {
      expect(canonicalBranchPath(pathname, "nestpharmacy", "amawbia")).toBeNull();
    },
  );
});
