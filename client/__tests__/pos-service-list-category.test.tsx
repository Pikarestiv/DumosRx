import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { POSServiceList } from "@/components/pos/pos-service-list";
import type { Service } from "@/lib/types/service";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAdmin: false }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => false,
}));

const service = (id: string, name: string, category: string | null): Service => ({
  id,
  store_id: "store-1",
  name,
  code: null,
  category,
  description: null,
  price: 5000,
  is_active: true,
  created_at: "2026-11-17T10:00:00.000Z",
  updated_at: "2026-11-17T10:00:00.000Z",
});

const services = [
  service("s1", "Blood pressure check", "Cardiology"),
  service("s2", "Teeth whitening", "Dental"),
];

describe("POS services tab", () => {
  it("offers category chips as the same tab control the products tab uses, and filters by them", () => {
    render(<POSServiceList services={services} addToCart={vi.fn()} />);

    const chips = screen.getAllByRole("tab");
    expect(chips.map((chip) => chip.textContent)).toEqual(["All", "Cardiology", "Dental"]);
    expect(screen.getByRole("tab", { name: "Dental" }).getAttribute("data-state")).toBe("inactive");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dental" }));

    expect(screen.queryByText("Blood pressure check")).toBeNull();
    expect(screen.getByText("Teeth whitening")).toBeDefined();
  });

  it("draws each service card with its category's icon", () => {
    render(<POSServiceList services={[services[0]]} addToCart={vi.fn()} />);

    const card = screen.getByRole("button", { name: /blood pressure check/i });
    expect(within(card).getByTestId("service-category-icon").querySelector("svg")?.getAttribute("class")).toContain("lucide-heart-pulse");
  });
});
