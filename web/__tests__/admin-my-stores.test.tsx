import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MyStoresPage from "@/app/admin/stores/mine/page";
import { visibleSidebarItems } from "@/components/admin/sidebar-items";
import type { RegisteredStoreSummary } from "@/lib/types/admin";

const { queryState } = vi.hoisted(() => ({
  queryState: {
    data: undefined as
      | { data: RegisteredStoreSummary[]; meta?: { current_page: number; last_page: number; total: number } }
      | undefined,
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/admin-hooks-stores", () => ({
  useMyRegisteredStores: () => ({ ...queryState, refetch: vi.fn() }),
}));

const store: RegisteredStoreSummary = {
  id: "store-1",
  name: "Pikarestiv Stores",
  owner: "Ada Owner",
  email: "ada@dumosrx.com",
  plan: "pro",
  plan_status: "active",
  plan_ends_at: "Oct 30, 2026",
  status: "Active",
  date: "Jan 02, 2026",
  device_id: "DESKTOP-9QK3ZLA",
};

describe("My Stores (scoped registered-store list)", () => {
  it("is in the sidebar for platform_admin and agent only", () => {
    for (const role of ["platform_admin", "agent"]) {
      expect(visibleSidebarItems(role).map((i) => i.id)).toContain("my-stores");
    }
    expect(visibleSidebarItems("super_admin").map((i) => i.id)).not.toContain(
      "my-stores",
    );
  });

  it("lists the caller's registered stores without any revenue column", () => {
    queryState.data = {
      data: [store],
      meta: { current_page: 1, last_page: 1, total: 1 },
    };
    render(<MyStoresPage />);

    expect(screen.getByText("Pikarestiv Stores")).toBeInTheDocument();
    expect(screen.getByText("ada@dumosrx.com")).toBeInTheDocument();
    expect(screen.getByText("Dumos Pro")).toBeInTheDocument();
    expect(screen.queryByText(/revenue/i)).toBeNull();
    expect(screen.queryByText(/₦/)).toBeNull();
  });

  it("explains an empty list instead of rendering a bare table", () => {
    queryState.data = {
      data: [],
      meta: { current_page: 1, last_page: 1, total: 0 },
    };
    render(<MyStoresPage />);

    expect(
      screen.getByText(/no stores registered under your account yet/i),
    ).toBeInTheDocument();
  });
});
