import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ canManage: true }));

vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => false }));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ canManageStockBatch: state.canManage }) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { name: "Dumos", uppercase_display_enabled: 0 } }) }));

import { ProductActionsMenu } from "@/components/products/product-actions-menu";

function renderMenu(onManageCategories = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductActionsMenu onManageCategories={onManageCategories} onProductsChanged={() => {}} />
    </QueryClientProvider>,
  );
  return onManageCategories;
}

beforeEach(() => {
  state.canManage = true;
});

describe("Product actions menu on its own (the mobile catalog toolbar)", () => {
  it("opens category management for someone who can manage stock", () => {
    const onManageCategories = renderMenu();
    fireEvent.pointerDown(screen.getByRole("button", { name: /product actions/i }), { button: 0, ctrlKey: false, pointerType: "mouse" });

    fireEvent.click(screen.getByRole("menuitem", { name: /manage categories/i }));

    expect(onManageCategories).toHaveBeenCalledTimes(1);
  });

  it("is absent for someone with nothing to do in it", () => {
    state.canManage = false;
    renderMenu();

    expect(screen.queryByRole("button", { name: /product actions/i })).toBeNull();
  });
});
