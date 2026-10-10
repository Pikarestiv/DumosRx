import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreStorefrontCard } from "@/components/admin/stores/details/store-storefront-card";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

const { toggleMutate } = vi.hoisted(() => ({ toggleMutate: vi.fn() }));

vi.mock("@/lib/api/admin-hooks", () => ({
  useSetStoreStorefrontMutation: () => ({ mutate: toggleMutate, isPending: false }),
}));

const { authState } = vi.hoisted(() => ({
  authState: { permissions: ["manage_account_status"] as string[] },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: { role: "platform_admin" } }),
  checkHasPermission: (_user: unknown, permission: string) =>
    authState.permissions.includes(permission),
}));

const storeWith = (enabled: boolean, slug: string | null = "corner-pharmacy") =>
  ({
    id: "store-1",
    storefront: {
      online_store_enabled: enabled,
      store_slug: slug,
      pending_rebuild: false,
      dirty_since: null,
    },
  }) as unknown as AdminStoreDetail;

describe("StoreStorefrontCard toggle", () => {
  beforeEach(() => {
    authState.permissions = ["manage_account_status"];
    toggleMutate.mockClear();
  });

  it("publishes a disabled storefront from the detail page", async () => {
    render(<StoreStorefrontCard store={storeWith(false)} />);

    await userEvent.click(screen.getByRole("switch", { name: /publish storefront/i }));

    expect(toggleMutate.mock.calls[0][0]).toEqual({ id: "store-1", enabled: true });
  });

  it("unpublishes a published storefront", async () => {
    render(<StoreStorefrontCard store={storeWith(true)} />);

    await userEvent.click(screen.getByRole("switch", { name: /unpublish storefront/i }));

    expect(toggleMutate.mock.calls[0][0]).toEqual({ id: "store-1", enabled: false });
  });

  it("hides the switch entirely, rather than disabling it, without manage_account_status", () => {
    authState.permissions = [];

    render(<StoreStorefrontCard store={storeWith(true)} />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });
});

/**
 * The toggle refuses (422) to publish a store with no slug, which left the
 * admin with nothing to do about it — the slug was read-only on this page.
 */
describe("StoreStorefrontCard slug editing", () => {
  beforeEach(() => {
    authState.permissions = ["manage_account_status"];
    toggleMutate.mockClear();
  });

  it("sets the slug on a store that has none, in the same call as publishing", async () => {
    render(<StoreStorefrontCard store={storeWith(false, null)} />);

    await userEvent.click(screen.getByRole("button", { name: /set address/i }));
    await userEvent.type(screen.getByLabelText(/storefront address/i), "corner-pharmacy-ikeja");
    await userEvent.click(screen.getByRole("button", { name: /^save address$/i }));

    expect(toggleMutate.mock.calls[0][0]).toEqual({
      id: "store-1",
      enabled: false,
      storeSlug: "corner-pharmacy-ikeja",
    });
  });

  it("does not submit an empty slug", async () => {
    render(<StoreStorefrontCard store={storeWith(false, null)} />);

    await userEvent.click(screen.getByRole("button", { name: /set address/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save address$/i }));

    expect(toggleMutate).not.toHaveBeenCalled();
  });

  it("confirms before replacing a slug that is already live, naming the URL that breaks", async () => {
    render(<StoreStorefrontCard store={storeWith(true, "corner-pharmacy")} />);

    await userEvent.click(screen.getByRole("button", { name: /change address/i }));
    await userEvent.clear(screen.getByLabelText(/storefront address/i));
    await userEvent.type(screen.getByLabelText(/storefront address/i), "new-address");
    await userEvent.click(screen.getByRole("button", { name: /^save address$/i }));

    expect(toggleMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/corner-pharmacy/)).toBeInTheDocument();
    expect(screen.getByText(/stop working|no longer|break/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /change the address/i }));

    expect(toggleMutate.mock.calls[0][0]).toEqual({
      id: "store-1",
      enabled: true,
      storeSlug: "new-address",
    });
  });

  it("hides the slug control entirely, not disabled, without manage_account_status", () => {
    authState.permissions = [];

    render(<StoreStorefrontCard store={storeWith(false, null)} />);

    expect(screen.queryByRole("button", { name: /set address|change address/i })).not.toBeInTheDocument();
  });
});
