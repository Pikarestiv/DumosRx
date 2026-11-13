import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { StorefrontThemePicker } from "@/components/admin/stores/details/storefront-theme-picker";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));

const storeWithTheme = (theme?: string, available_themes?: string[]) =>
  ({
    id: "store-1",
    storefront: { online_store_enabled: true, store_slug: "corner", pending_rebuild: false, dirty_since: null, theme, available_themes },
  }) as unknown as AdminStoreDetail;

function renderPicker(store: AdminStoreDetail) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <StorefrontThemePicker store={store} />
    </QueryClientProvider>,
  );
}

const signInAs = (role: string) =>
  useAdminAuthStore.setState({ user: { id: "u1", email: "a@dumosrx.com", first_name: "A", last_name: "B", role } });

describe("StorefrontThemePicker", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ message: "ok", theme: "navy" });
  });

  it("lets a super admin pick a theme and sends it to the theme endpoint", async () => {
    signInAs("super_admin");
    renderPicker(storeWithTheme("emerald"));

    expect(screen.getByRole("button", { name: "Default theme" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Navy theme" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("admin/stores/store-1/storefront/theme", { method: "PUT", body: { theme: "navy" } }),
    );
  });

  it("does not call the server when the current theme is clicked again", async () => {
    signInAs("super_admin");
    renderPicker(storeWithTheme("rose"));

    await userEvent.click(screen.getByRole("button", { name: "Rose theme" }));

    expect(request).not.toHaveBeenCalled();
  });

  it("only offers themes the server says it accepts", () => {
    signInAs("super_admin");
    renderPicker(storeWithTheme("emerald", ["emerald", "navy"]));

    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Default theme", "Navy theme"]);
  });

  it("shows a platform admin the theme read-only, with no swatches to click", () => {
    signInAs("platform_admin");
    renderPicker(storeWithTheme("violet"));

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Violet")).toBeTruthy();
  });

  it("treats a store whose theme the server has never set as the default", () => {
    signInAs("super_admin");
    renderPicker(storeWithTheme(undefined));

    expect(screen.getByRole("button", { name: "Default theme" }).getAttribute("aria-pressed")).toBe("true");
  });
});
