import { describe, it, expect } from "vitest";
import {
  getPageInfo,
  resolveHeaderAction,
} from "@/lib/constants/dashboard-page-routes";

/**
 * PAGE_ROUTES' `actionPermission` is how a route's header action moves off
 * the coarse actionAdminOnly/canManageStockBatch baseline onto a specific
 * key. Procurement's "Create Order" is manage_purchase_orders and Vendors'
 * "Add Supplier" is manage_suppliers; the callback defaults to granting
 * everything so untouched routes and existing callers behave exactly as
 * they did.
 */

function resolve(pathname: string, granted: string[] | null) {
  return resolveHeaderAction(
    pathname,
    getPageInfo(pathname),
    true,
    true,
    true,
    false,
    granted === null ? undefined : (key: string) => granted.includes(key),
  );
}

describe("header action permission gating", () => {
  it("shows Create Order with manage_purchase_orders", () => {
    expect(resolve("/procurement", ["manage_purchase_orders"])?.label).toBe(
      "Create Order",
    );
  });

  it("withholds Create Order without manage_purchase_orders", () => {
    expect(resolve("/procurement", [])).toBeNull();
  });

  it("shows Add Supplier with manage_suppliers", () => {
    expect(
      resolve("/procurement/vendors", ["manage_suppliers"])?.label,
    ).toBe("Add Supplier");
  });

  it("withholds Add Supplier without manage_suppliers", () => {
    expect(resolve("/procurement/vendors", [])).toBeNull();
  });

  it("shows New Prescription with manage_prescriptions", () => {
    expect(resolve("/prescriptions", ["manage_prescriptions"])?.label).toBe(
      "New Prescription",
    );
  });

  it("withholds New Prescription without manage_prescriptions", () => {
    expect(resolve("/prescriptions", [])).toBeNull();
  });

  it("leaves routes with no actionPermission alone", () => {
    expect(resolve("/inventory/catalog", [])?.label).toBe("Add Product");
  });

  it("grants everything when no permission callback is passed", () => {
    expect(resolve("/procurement", null)?.label).toBe("Create Order");
  });
});
