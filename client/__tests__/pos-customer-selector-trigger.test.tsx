import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/db/local-database", () => ({ insert: vi.fn() }));

import { POSCustomerSelector } from "@/components/pos/pos-customer-selector";
import type { Customer } from "@/lib/types/customer";

const customer = {
  id: "c1",
  first_name: "Oluwaseyifunmi Chukwuemeka",
  last_name: "Adebayo-Okonkwo",
  phone: "08031234567",
  loyalty_points: 1240,
} as unknown as Customer;

describe("POS customer trigger with a long name", () => {
  it("keeps the points figure in an element that never truncates, so a long name cannot push it off", () => {
    render(
      <POSCustomerSelector selectedCustomer={customer} customers={[customer]} loadingCustomers={false} onSelectCustomer={vi.fn()} />,
    );

    const points = screen.getByText(/1240 pts/);
    expect(points.className).toContain("shrink-0");
    for (let el: HTMLElement | null = points; el; el = el.parentElement) {
      expect(el.className).not.toMatch(/(^|\s)truncate(\s|$)/);
    }
    const name = screen.getByText(/Oluwaseyifunmi Chukwuemeka/);
    expect(name.closest(".truncate")).not.toBeNull();
  });
});
