import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ServicesList } from "@/components/services/services-list";
import type { Service } from "@/lib/types/service";

const mockUseMediaQuery = vi.fn();

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

const mockServices: Service[] = [
  {
    id: "srv-1",
    store_id: "store-1",
    name: "Full Body Massage",
    code: "SRV-MAS-01",
    category: "Spa & Wellness",
    description: "60-minute relaxing body massage",
    price: 15000,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "srv-2",
    store_id: "store-1",
    name: "Doctor Consultation",
    code: "SRV-CON-01",
    category: "Clinic",
    description: null,
    price: 5000,
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe("ServicesList responsive layout", () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders separate mobile cards when on a mobile viewport (< 640px)", () => {
    mockUseMediaQuery.mockReturnValue(false);

    const { container } = render(
      <ServicesList
        services={mockServices}
        currencyCode="NGN"
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    expect(container.querySelector("table")).toBeNull();
    const mobileCards = container.querySelectorAll("[data-service-card-mobile]");
    expect(mobileCards.length).toBe(2);

    expect(screen.getByText("Full Body Massage")).toBeDefined();
    expect(screen.getByText("SRV-MAS-01")).toBeDefined();
    expect(screen.getByText("Spa & Wellness")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
    expect(screen.getByText("Inactive")).toBeDefined();
  });

  it("renders a tabular grid when on desktop viewport (>= 640px)", () => {
    mockUseMediaQuery.mockReturnValue(true);

    const { container } = render(
      <ServicesList
        services={mockServices}
        currencyCode="NGN"
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(container.querySelector("[data-service-card-mobile]")).toBeNull();

    expect(screen.getByText("Service Name")).toBeDefined();
    expect(screen.getByText("Code")).toBeDefined();
    expect(screen.getByText("Category")).toBeDefined();
    expect(screen.getByText("Price")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
  });
});
