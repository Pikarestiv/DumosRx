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
