import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuckItemActions } from "@/components/admin/stores/details/stuck-item-actions";

vi.mock("@/lib/api/admin-hooks-sync", () => ({
  useIssueSyncCommandMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const item = (table: string) => ({
  table_name: table,
  record_id: "r1",
  attempts: 7,
  reason: "forbidden",
});

describe("StuckItemActions", () => {
  it("offers retry for any stuck row", () => {
    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("sales")} />);

    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });

  /**
   * Hidden, not shown-and-refused: a business record's only copy is on that
   * device, so discarding it would permanently lose revenue data.
   */
  it("does not offer abandon for a business record", () => {
    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("stock_movements")} />);

    expect(screen.queryByRole("button", { name: /abandon/i })).toBeNull();
  });

  it("offers abandon for a diagnostic record", () => {
    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />);

    expect(screen.getByRole("button", { name: /abandon/i })).toBeDefined();
  });
});
