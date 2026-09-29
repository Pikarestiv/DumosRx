import { describe, it, expect } from "vitest";
import { hasPermission } from "@/lib/hooks/use-permissions";

/**
 * "request_stock_transfers" now sits IN pos-layout-header.tsx's
 * composition rather than beside it. Reconciling the two mechanisms that
 * already existed:
 *
 *  - the per-group key is the acting user's own right,
 *  - `staff_can_request_transfers` stays the store-wide opt-in that lets a
 *    non-admin-tier account use it at all.
 *
 * They compose with AND, so unticking the key actually withholds the
 * button (it previously did nothing), while every role keeps exactly the
 * access it had - which is why sales_staff was granted the key by default
 * when enforcement landed: the toggle exists precisely so cashiers can
 * pull stock in, and an AND with a key they lacked would have silently
 * disabled that feature for every store using it.
 */
function canRequestTransfer(
  role: string | undefined,
  staffCanRequestTransfers: number | undefined,
) {
  const user = role ? { role } : null;
  return (
    hasPermission(user, null, "process_sales") &&
    hasPermission(user, null, "request_stock_transfers") &&
    (hasPermission(user, null, "manage_staff") ||
      staffCanRequestTransfers === 1)
  );
}

describe("request_stock_transfers enforcement (pos-layout-header.tsx)", () => {
  it("keeps admin-tier roles unaffected by the setting", () => {
    expect(canRequestTransfer("admin", 0)).toBe(true);
    expect(canRequestTransfer("manager", 0)).toBe(true);
    expect(canRequestTransfer("store_owner", undefined)).toBe(true);
  });

  it("keeps non-admin staff gated on the store setting", () => {
    expect(canRequestTransfer("sales_staff", 0)).toBe(false);
    expect(canRequestTransfer("specialist", undefined)).toBe(false);
    expect(canRequestTransfer("sales_staff", 1)).toBe(true);
    expect(canRequestTransfer("specialist", 1)).toBe(true);
  });

  it("blocks a role that can't process sales at all", () => {
    expect(canRequestTransfer("auditor", 1)).toBe(false);
    expect(canRequestTransfer(undefined, 1)).toBe(false);
  });

  it("withholds the button from a group that has the toggle but not the key", () => {
    const group = { permissions: ["process_sales"] };
    expect(
      hasPermission({ role: "sales_staff" }, group, "process_sales") &&
        hasPermission(
          { role: "sales_staff" },
          group,
          "request_stock_transfers",
        ),
    ).toBe(false);
  });
});
