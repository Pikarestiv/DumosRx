import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { replace, nav } = vi.hoisted(() => ({ replace: vi.fn(), nav: { pathname: "/s/nestpharmacy/catalog/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ replace }) }));

import { BranchCanonicalizer } from "@/components/storefront/branch-canonicalizer";
import { useCartStore } from "@/lib/store/use-cart-store";

const branches = [
  { id: "1", name: "Nest Amawbia", slug: "nest-amawbia", is_primary: true },
  { id: "2", name: "Nest Agidi", slug: "nest-agidi", is_primary: false },
];

describe("branch canonicalizer", () => {
  beforeEach(() => {
    replace.mockReset();
    window.history.replaceState({}, "", "/s/nestpharmacy/catalog/?q=panadol");
  });

  it("sends a brand-level page of a multi-branch storefront to the main branch, keeping the query", () => {
    nav.pathname = "/s/nestpharmacy/catalog/";
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches} />);

    expect(replace).toHaveBeenCalledWith("/s/nestpharmacy/nest-amawbia/catalog/?q=panadol");
  });

  it("follows an old ?branch= link to the branch it names and drops the query", () => {
    nav.pathname = "/s/nestpharmacy/catalog/";
    window.history.replaceState({}, "", "/s/nestpharmacy/catalog/?branch=2&q=panadol");
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches} />);

    expect(replace).toHaveBeenCalledWith("/s/nestpharmacy/nest-agidi/catalog/?q=panadol");
  });

  it("carries a cart saved under the brand over to the branch the customer lands on", () => {
    useCartStore.setState({ carts: { nestpharmacy: [{ id: "p1", name: "Panadol", price: 500, quantity: 2 }] } });
    nav.pathname = "/s/nestpharmacy/catalog/";
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches} />);

    expect(useCartStore.getState().carts["nestpharmacy/nest-amawbia"]).toHaveLength(1);
    expect(useCartStore.getState().carts.nestpharmacy).toEqual([]);
  });

  it("does not overwrite a cart the branch already has", () => {
    useCartStore.setState({
      carts: {
        nestpharmacy: [{ id: "p1", name: "Panadol", price: 500, quantity: 1 }],
        "nestpharmacy/nest-amawbia": [{ id: "p2", name: "Aspirin", price: 300, quantity: 1 }],
      },
    });
    nav.pathname = "/s/nestpharmacy/catalog/";
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches} />);

    expect(useCartStore.getState().carts["nestpharmacy/nest-amawbia"][0].id).toBe("p2");
  });

  it("never moves a customer returning from Paystack, so their pending checkout is still found", () => {
    nav.pathname = "/s/nestpharmacy/checkout/";
    window.history.replaceState({}, "", "/s/nestpharmacy/checkout/?reference=T123&trxref=T123");
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves a branch page alone", () => {
    nav.pathname = "/s/nestpharmacy/nest-agidi/catalog/";
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves a single-branch storefront alone", () => {
    nav.pathname = "/s/nestpharmacy/catalog/";
    render(<BranchCanonicalizer storeSlug="nestpharmacy" branches={branches.slice(0, 1)} />);

    expect(replace).not.toHaveBeenCalled();
  });
});
