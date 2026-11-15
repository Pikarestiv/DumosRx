import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_BRANCH_PLACEHOLDER, getStorefrontBranchParams } from "@/lib/api/storefront-slugs";

const respondWith = (body: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));

describe("branch params for the static export", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pairs each storefront with its branch slugs", async () => {
    respondWith({ slugs: ["nestpharmacy"], branches: { nestpharmacy: ["nest-agidi", "nest-amawbia"] } });

    expect(await getStorefrontBranchParams()).toEqual([
      { store_slug: "nestpharmacy", branch: "nest-agidi" },
      { store_slug: "nestpharmacy", branch: "nest-amawbia" },
    ]);
  });

  it("emits one placeholder when no storefront has two branches, because an export may not be empty", async () => {
    respondWith({ slugs: ["solo"], branches: {} });

    expect(await getStorefrontBranchParams()).toEqual([{ store_slug: NO_BRANCH_PLACEHOLDER, branch: NO_BRANCH_PLACEHOLDER }]);
  });

  it("copes with an older API that sends no branches", async () => {
    respondWith({ slugs: ["solo"] });

    expect(await getStorefrontBranchParams()).toEqual([{ store_slug: NO_BRANCH_PLACEHOLDER, branch: NO_BRANCH_PLACEHOLDER }]);
  });
});
