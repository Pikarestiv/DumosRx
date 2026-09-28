import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);
let searchParams = new URLSearchParams();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/customers",
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeType: "pharmacy", storeProfile: { currency: "NGN" } }),
}));

vi.mock("@/lib/context/pull-to-refresh-context", () => ({
  usePullToRefreshHandler: vi.fn(),
}));

vi.mock("@/lib/hooks/use-customer-data", () => ({
  useCustomerData: () => ({
    customers: [],
    metrics: null,
    loadFailed: false,
    fetchCustomers: vi.fn(),
    addCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    recordPayment: vi.fn(),
  }),
}));

vi.mock("@/lib/db/queries/loyalty", () => ({
  getLoyaltyTiers: vi.fn(),
}));

import { useCustomerManagement } from "@/lib/hooks/use-customer-management";

/**
 * "/customers?action=add" is typeable and is also what the dashboard
 * header's "Add Customer" navigates to, so hiding the header action alone
 * would not be a gate - the modal's own opener has to require
 * manage_customers.
 */
describe("add customer overlay permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    searchParams = new URLSearchParams();
  });

  it("opens the Add Customer modal for ?action=add with manage_customers", () => {
    searchParams = new URLSearchParams("action=add");
    const { result } = renderHook(() => useCustomerManagement());
    expect(result.current.isAddCustomerOpen).toBe(true);
  });

  it("withholds the modal for a typed ?action=add without manage_customers", () => {
    hasPermission.mockImplementation((key) => key !== "manage_customers");
    searchParams = new URLSearchParams("action=add");
    const { result } = renderHook(() => useCustomerManagement());
    expect(result.current.isAddCustomerOpen).toBe(false);
  });

  it("checks the manage_customers key specifically", () => {
    renderHook(() => useCustomerManagement());
    expect(hasPermission).toHaveBeenCalledWith("manage_customers");
  });
});
