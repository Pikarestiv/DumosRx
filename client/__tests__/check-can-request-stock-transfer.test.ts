import { describe, it, expect } from "vitest";
import { hasPermission } from "@/lib/hooks/use-permissions";

// checkCanRequestStockTransfer (auth-context.tsx) was removed in favor of pos-layout-header.tsx composing two useHasPermis…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-check-can-request-stock-transfer-test-ts-L4
function canRequestTransfer(role: string | undefined, staffCanRequestTransfers: number | undefined) {
  const user = role ? { role } : null;
  return (
    hasPermission(user, null, "process_sales") &&
    (hasPermission(user, null, "manage_staff") || staffCanRequestTransfers === 1)
  );
}

describe("request-stock-transfer composition (pos-layout-header.tsx)", () => {
  it("lets admin-tier roles request a transfer regardless of the setting", () => {
    expect(canRequestTransfer("admin", 0)).toBe(true);
    expect(canRequestTransfer("manager", 0)).toBe(true);
    expect(canRequestTransfer("store_owner", undefined)).toBe(true);
  });

  it("blocks non-admin staff when the setting is off (the default)", () => {
    expect(canRequestTransfer("sales_staff", 0)).toBe(false);
    expect(canRequestTransfer("specialist", undefined)).toBe(false);
  });

  it("lets non-admin staff request a transfer once the setting is on", () => {
    expect(canRequestTransfer("sales_staff", 1)).toBe(true);
    expect(canRequestTransfer("specialist", 1)).toBe(true);
  });

  it("blocks a role that can't process sales at all, setting on or off", () => {
    expect(canRequestTransfer("auditor", 1)).toBe(false);
    expect(canRequestTransfer(undefined, 1)).toBe(false);
  });
});
