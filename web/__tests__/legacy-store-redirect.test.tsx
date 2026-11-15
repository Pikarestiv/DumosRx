import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { LegacyStoreRedirect } from "@/components/storefront/legacy-store-redirect";
import { legacyStoreTarget } from "@/lib/storefront-legacy-path";

describe("legacy /store links", () => {
  it.each([
    ["/store/nestpharmacy", "/s/nestpharmacy"],
    ["/store/nestpharmacy/", "/s/nestpharmacy/"],
    ["/store/nestpharmacy/catalog/", "/s/nestpharmacy/catalog/"],
    ["/store/nestpharmacy/checkout", "/s/nestpharmacy/checkout"],
    ["/storefront/x", "/storefront/x"],
    ["/s/nestpharmacy", "/s/nestpharmacy"],
  ])("maps %s to %s", (from, to) => {
    expect(legacyStoreTarget(from)).toBe(to);
  });

  describe("the redirect page", () => {
    const replace = vi.fn();

    beforeEach(() => {
      replace.mockReset();
      vi.stubGlobal("location", { ...window.location, pathname: "/store/nestpharmacy/checkout/", search: "?reference=T123&trxref=T123", hash: "", replace });
    });

    afterEach(() => vi.unstubAllGlobals());

    it("sends a customer returning from Paystack to the new checkout with the payment reference intact", async () => {
      render(<LegacyStoreRedirect />);

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/s/nestpharmacy/checkout/?reference=T123&trxref=T123"));
      expect(screen.getByRole("link", { name: /continue to the store/i }).getAttribute("href")).toBe("/s/nestpharmacy/checkout/?reference=T123&trxref=T123");
    });
  });
});
