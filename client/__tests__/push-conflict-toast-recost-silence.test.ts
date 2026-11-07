import { describe, it, expect, vi, beforeEach } from "vitest";

const toastWarning = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { warning: toastWarning } }));

import { announceTerminalConflicts } from "@/lib/db/sync-engine/push-conflict-toasts";

describe("the silence for a refused automatic re-cost", () => {
  beforeEach(() => {
    toastWarning.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("covers a sale_items UPDATE refused as version_conflict", () => {
    announceTerminalConflicts([{ table_name: "sale_items", record_id: "l1", reason: "version_conflict", operation: "UPDATE" }], []);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("still toasts a sale_items stale_timestamp and a refused sale_items INSERT", () => {
    announceTerminalConflicts(
      [
        { table_name: "sale_items", record_id: "l1", reason: "stale_timestamp", operation: "UPDATE" },
        { table_name: "sale_items", record_id: "l2", reason: "version_conflict", operation: "INSERT" },
      ],
      [],
    );
    expect(toastWarning).toHaveBeenCalledTimes(2);
  });
});
