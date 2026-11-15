import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { replace, nav } = vi.hoisted(() => ({ replace: vi.fn(), nav: { pathname: "/s/nestpharmacy/catalog/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ replace }) }));

import { BranchCanonicalizer } from "@/components/storefront/branch-canonicalizer";

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
