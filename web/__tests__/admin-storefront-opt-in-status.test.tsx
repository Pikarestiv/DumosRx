import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreStorefrontCard } from "@/components/admin/stores/details/store-storefront-card";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

const { toggleMutate } = vi.hoisted(() => ({ toggleMutate: vi.fn() }));

vi.mock("@/lib/api/admin-hooks", () => ({
  useSetStoreStorefrontMutation: () => ({ mutate: toggleMutate, isPending: false }),
}));
vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: { role: "super_admin" } }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: () => true,
}));

const storeWith = (storefront: Partial<AdminStoreDetail["storefront"]>) =>
  ({
    id: "store-1",
    storefront: { online_store_enabled: true, store_slug: "corner-shop", pending_rebuild: false, dirty_since: null, ...storefront },
  }) as unknown as AdminStoreDetail;

describe("the Starter opt-in on the admin storefront card", () => {
  beforeEach(() => toggleMutate.mockClear());

  it("shows who opted in and when, with the time", () => {
    render(<StoreStorefrontCard store={storeWith({ opt_in_required: true, opted_in_by: "admin", opted_in_at: "2026-11-27T09:05:00Z", storefront_live: true })} />);

    expect(screen.getByText("By an admin on 27/11/2026 09:05")).toBeTruthy();
  });

  it("names the owner when the owner opted in from the till", () => {
    render(<StoreStorefrontCard store={storeWith({ opt_in_required: true, opted_in_by: "owner", opted_in_at: "2026-11-26T18:40:00Z", storefront_live: true })} />);

    expect(screen.getByText("By the owner on 26/11/2026 18:40")).toBeTruthy();
  });

  it("explains a switched-on Starter store that is not live and lets the admin put it live", async () => {
    render(<StoreStorefrontCard store={storeWith({ opt_in_required: true, opted_in_by: null, opted_in_at: null, storefront_live: false })} />);

    expect(screen.getByText(/not live yet/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Put it live for the owner" }));

    expect(toggleMutate).toHaveBeenCalledWith({ id: "store-1", enabled: true }, expect.anything());
  });

  it("shows nothing about opting in on a plan that needs none", () => {
    render(<StoreStorefrontCard store={storeWith({ opt_in_required: false, opted_in_by: null, opted_in_at: null, storefront_live: true })} />);

    expect(screen.queryByText(/opt-in/i)).toBeNull();
  });
});
