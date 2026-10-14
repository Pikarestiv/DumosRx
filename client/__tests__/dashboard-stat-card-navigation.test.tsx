import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ShoppingCart, Package } from "lucide-react";
import { DashboardStats, type StatCard } from "@/components/dashboard/dashboard-stats";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

/**
 * A dashboard figure is a question — "which sales?", "which products?" — and
 * the answer is a screen that already exists. A card with no `href` is a card
 * whose figure is itemised nowhere, and it must keep looking inert.
 */
const card = (overrides: Partial<StatCard> = {}): StatCard => ({
  title: "Today's Sales",
  value: "₦120,000",
  icon: ShoppingCart,
  ...overrides,
});

describe("DashboardStats: cards that lead somewhere", () => {
  beforeEach(() => push.mockClear());
  afterEach(cleanup);

  it("routes to the sales history when a sales figure is clicked", () => {
    render(<DashboardStats statsCards={[card({ href: "/pos?tab=history" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /Today's Sales/ }));

    expect(push).toHaveBeenCalledWith("/pos?tab=history");
  });

  it("answers the keyboard, because a figure is not a mouse target", () => {
    render(<DashboardStats statsCards={[card({ href: "/inventory/catalog" })]} />);
    const target = screen.getByRole("button", { name: /Today's Sales/ });

    fireEvent.keyDown(target, { key: "Enter" });
    fireEvent.keyDown(target, { key: " " });

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith("/inventory/catalog");
  });

  it("sends each card to its own screen", () => {
    render(
      <DashboardStats
        statsCards={[
          card({ title: "Total Products", icon: Package, href: "/inventory/catalog" }),
          card({ title: "Inventory Value", href: "/inventory/overview" }),
          card({ title: "Orders Today", href: "/pos?tab=history" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Total Products/ }));
    fireEvent.click(screen.getByRole("button", { name: /Inventory Value/ }));
    fireEvent.click(screen.getByRole("button", { name: /Orders Today/ }));

    expect(push.mock.calls.map(([route]) => route)).toEqual([
      "/inventory/catalog",
      "/inventory/overview",
      "/pos?tab=history",
    ]);
  });

  it("leaves a card without an href inert, not a button and not focusable", () => {
    render(<DashboardStats statsCards={[card({ title: "Trading Days" })]} />);

    expect(screen.queryByRole("button")).toBeNull();
    const title = screen.getByText("Trading Days");
    fireEvent.click(title);

    expect(push).not.toHaveBeenCalled();
  });
});
