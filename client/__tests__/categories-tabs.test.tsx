import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/settings/categories",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/settings/store/categories-card", () => ({ CategoriesCard: () => <div>PRODUCT CATEGORIES</div> }));
vi.mock("@/components/settings/store/service-categories-card", () => ({ ServiceCategoriesCard: () => <div>SERVICE CATEGORIES</div> }));

import { CategoriesTabs } from "@/components/settings/store/categories-tabs";

beforeEach(() => {
  nav.search = "";
  nav.replace.mockClear();
});

describe("Categories settings tabs", () => {
  it("opens on Products by default", () => {
    render(<CategoriesTabs />);
    expect(screen.getByText("PRODUCT CATEGORIES")).toBeTruthy();
    expect(screen.queryByText("SERVICE CATEGORIES")).toBeNull();
  });

  it("opens on Services when the link asks for it", () => {
    nav.search = "type=services";
    render(<CategoriesTabs />);
    expect(screen.getByText("SERVICE CATEGORIES")).toBeTruthy();
  });

  it("switching to Services puts it in the address so the tab survives a reload", () => {
    render(<CategoriesTabs />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Services" }));
    fireEvent.click(screen.getByRole("tab", { name: "Services" }));
    expect(nav.replace).toHaveBeenCalledWith("/settings/categories?type=services");
  });
});
