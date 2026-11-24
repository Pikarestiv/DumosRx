import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";

const store = { id: "s1", name: "Divamax" };

describe("StorefrontFooter Powered by badge", () => {
  it("shows the badge when the plan keeps it", () => {
    render(<StorefrontFooter storeSlug="divamax" store={store} storefront={{ id: "f1", slug: "divamax", name: "Divamax", show_powered_by: true }} />);

    expect(screen.getByRole("link", { name: /powered by/i })).toBeTruthy();
  });

  it("shows the badge for a payload from before the plan split", () => {
    render(<StorefrontFooter storeSlug="divamax" store={store} storefront={{ id: "f1", slug: "divamax", name: "Divamax" }} />);

    expect(screen.getByRole("link", { name: /powered by/i })).toBeTruthy();
  });

  it("hides the badge when the plan removes it", () => {
    render(<StorefrontFooter storeSlug="divamax" store={store} storefront={{ id: "f1", slug: "divamax", name: "Divamax", show_powered_by: false }} />);

    expect(screen.queryByRole("link", { name: /powered by/i })).toBeNull();
    expect(screen.getByText(/Divamax/)).toBeTruthy();
  });
});
