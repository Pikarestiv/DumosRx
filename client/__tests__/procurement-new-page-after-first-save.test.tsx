import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/procurement/new";
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/components/auth/require-role", () => ({ RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/procurement/order-screen/po-order-screen", () => ({
  PoOrderScreen: ({ initialId }: { initialId: string | null }) => <div>order screen {initialId ?? "new"}</div>,
}));
vi.mock("@/lib/storage-keys", () => ({ getStoredUser: () => ({ id: "u1" }) }));
vi.mock("@/lib/db/queries/procurement-draft-status", () => ({
  getRecentDraftForUser: () =>
    Promise.resolve({ id: "just-created", item_count: 1, updated_at: new Date().toISOString(), vendor_name: null }),
}));

import CreateOrderPage from "@/app/(dashboard)/procurement/new/page";

describe("the new-order page once the draft has been saved", () => {
  beforeEach(() => {
    pathname = "/procurement/new";
    query = "";
  });

  it("offers the latest draft before a new order is started", async () => {
    render(<CreateOrderPage />);
    expect(await screen.findByText("Continue your last order?")).toBeTruthy();
  });

  it("keeps showing the order being edited instead of offering it back as a draft to continue", () => {
    pathname = "/procurement/edit";
    query = "id=just-created";
    render(<CreateOrderPage />);
    expect(screen.getByText("order screen just-created")).toBeTruthy();
    expect(screen.queryByText("Continue your last order?")).toBeNull();
  });
});
