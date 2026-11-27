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

  it.each([undefined, null, "", "florist"])("treats a store whose type is %j as a general shop", (storeType) => {
    const { container } = renderStorefrontCopy({ id: "p", name: "Grace", store_type: storeType });

    expect(container.textContent).not.toMatch(PHARMACY_WORDS);
    expect(screen.getByText(/follow the store's own policy/)).toBeTruthy();
  });

  it.each(["retail", "supermarket", "grocery", "general", "fashion", "electronics", "auto_parts", "stationery", "agro", "other"])(
    "uses none of the pharmacy wording anywhere for a %s store",
    (storeType) => {
      const { container } = renderStorefrontCopy({ id: "c", name: "Cutis Aesthetics & Med Spa", store_type: storeType });

      expect(container.textContent).not.toMatch(PHARMACY_WORDS);
      expect(screen.getByText("What is your return policy?")).toBeTruthy();
      expect(screen.getByText(/follow the store's own policy/)).toBeTruthy();
    },
  );
});

describe("beauty and hardware storefront copy", () => {
  it.each(["beauty", "hardware"])("uses none of the pharmacy wording anywhere for a %s store", (storeType) => {
    const { container } = renderStorefrontCopy({ id: "x", name: "Cutis Aesthetics & Med Spa", store_type: storeType });

    expect(container.textContent).not.toMatch(PHARMACY_WORDS);
  });

  it("speaks to genuine products and shade matching for a beauty store", () => {
    renderStorefrontCopy({ id: "b", name: "Cutis", store_type: "beauty" });

    expect(screen.getByText("Are your beauty products genuine?")).toBeTruthy();
    expect(screen.getByText("Can you help me choose the right shade or product?")).toBeTruthy();
  });

  it("speaks to bulk orders and measurements for a hardware store", () => {
    renderStorefrontCopy({ id: "h", name: "Divamax", store_type: "hardware" });

    expect(screen.getByText("Can I order in bulk for a building project?")).toBeTruthy();
    expect(screen.getByText("Can I buy by length, weight or other measurements?")).toBeTruthy();
  });
});

describe("storefront footer", () => {
  it("credits the platform by its domain, not its brand name", () => {
    render(<StorefrontFooter storeSlug="c" store={{ id: "c", name: "Cutis" }} />);

    expect(screen.getByText("Powered by dumosrx.com")).toBeTruthy();
    expect(screen.queryByText(/Powered by DumosRx/)).toBeNull();
  });
});
