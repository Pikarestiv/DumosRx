import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreFaqSection } from "@/components/storefront/store-faq-section";
import { StoreAboutSection } from "@/components/storefront/store-about-section";
import { StoreLocationsSection } from "@/components/storefront/store-locations-section";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import type { StorefrontStore } from "@/lib/api/storefront-data";

const PHARMACY_WORDS = /pharmac|dispens|prescription|medicat/i;

function renderStorefrontCopy(store: StorefrontStore) {
  return render(
    <>
      <StoreAboutSection store={store} />
      <StoreLocationsSection storeSlug="s" store={store} />
      <StoreFaqSection store={store} />
      <StorefrontFooter storeSlug="s" store={store} />
    </>,
  );
}

describe("storefront copy follows the store type", () => {
  it("keeps the dispensary and prescription wording for a pharmacy", () => {
    renderStorefrontCopy({ id: "p", name: "Grace Chemist", store_type: "pharmacy" });

    expect(screen.getByText("Can I order prescription-only medications?")).toBeTruthy();
    expect(screen.getByText(/our dispensary prepares your items/)).toBeTruthy();
    expect(screen.getByText(/pharmacy locations/)).toBeTruthy();
  });

  it("treats a store with no type, from an older API, as a pharmacy", () => {
    renderStorefrontCopy({ id: "p", name: "Grace Chemist" });

    expect(screen.getByText("Can I order prescription-only medications?")).toBeTruthy();
  });

  it.each(["retail", "supermarket", "general"])(
    "uses none of the pharmacy wording anywhere for a %s store",
    (storeType) => {
      const { container } = renderStorefrontCopy({ id: "c", name: "Cutis Aesthetics & Med Spa", store_type: storeType });

      expect(container.textContent).not.toMatch(PHARMACY_WORDS);
      expect(screen.getByText("What is your return policy?")).toBeTruthy();
      expect(screen.getByText(/follow the store's own policy/)).toBeTruthy();
    },
  );
});

describe("storefront footer", () => {
  it("credits the platform by its domain, not its brand name", () => {
    render(<StorefrontFooter storeSlug="c" store={{ id: "c", name: "Cutis" }} />);

    expect(screen.getByText("Powered by dumosrx.com")).toBeTruthy();
    expect(screen.queryByText(/Powered by DumosRx/)).toBeNull();
  });
});
