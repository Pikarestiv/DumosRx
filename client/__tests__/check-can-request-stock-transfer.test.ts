import { describe, it, expect } from "vitest";
import { checkCanRequestStockTransfer } from "@/lib/context/auth-context";

describe("checkCanRequestStockTransfer", () => {
  it("lets admin-tier roles request a transfer regardless of the setting", () => {
    expect(checkCanRequestStockTransfer("admin", 0)).toBe(true);
    expect(checkCanRequestStockTransfer("manager", 0)).toBe(true);
    expect(checkCanRequestStockTransfer("store_owner", undefined)).toBe(true);
  });

  it("blocks non-admin staff when the setting is off (the default)", () => {
    expect(checkCanRequestStockTransfer("sales_staff", 0)).toBe(false);
    expect(checkCanRequestStockTransfer("specialist", undefined)).toBe(false);
  });

  it("lets non-admin staff request a transfer once the setting is on", () => {
    expect(checkCanRequestStockTransfer("sales_staff", 1)).toBe(true);
    expect(checkCanRequestStockTransfer("specialist", 1)).toBe(true);
  });

  it("blocks a role that can't process sales at all, setting on or off", () => {
    expect(checkCanRequestStockTransfer("auditor", 1)).toBe(false);
    expect(checkCanRequestStockTransfer(undefined, 1)).toBe(false);
  });
});
