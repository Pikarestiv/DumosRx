import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityLogDetailPanel } from "@/components/activity-log/activity-log-detail-panel";
import type { AuditLogRow } from "@/lib/types/audit-log";

const granted = new Set<string>();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
}));

describe("ActivityLogDetailPanel cost field visibility", () => {
  beforeEach(() => {
    granted.clear();
  });

  const baseEntry: AuditLogRow = {
    id: "log-1",
    action: "BATCH_COST_CORRECTED",
    table_name: "stock_batches",
    record_id: "batch-101",
    user_name: "John Doe",
    created_at: "2026-11-14T10:00:00.000Z",
    details: JSON.stringify({
      batch_number: "BATCH-42",
      previous_cost_price: 1500,
      cost_price: 1750,
      selling_price: 2500,
      counted_cost_price: 1500,
      unit_cost: 1750,
      total_cost: 35000,
      notes: "Supplier invoiced higher rate",
      id: "batch-101",
      pin: "1234",
    }),
  };

  it("hides all cost keys and internal keys when view_cost_fields is withheld", () => {
    render(
      <ActivityLogDetailPanel
        entry={baseEntry}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Batch Number")).toBeTruthy();
    expect(screen.getByText("BATCH-42")).toBeTruthy();
    expect(screen.getByText("Selling Price")).toBeTruthy();
    expect(screen.getByText("2500")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByText("Supplier invoiced higher rate")).toBeTruthy();

    expect(screen.queryByText("Cost Price")).toBeNull();
    expect(screen.queryByText("Previous Cost Price")).toBeNull();
    expect(screen.queryByText("Counted Cost Price")).toBeNull();
    expect(screen.queryByText("Unit Cost")).toBeNull();
    expect(screen.queryByText("Total Cost")).toBeNull();

    expect(screen.queryByText("1750")).toBeNull();
    expect(screen.queryByText("1500")).toBeNull();
    expect(screen.queryByText("35000")).toBeNull();

    expect(screen.queryByText("Pin")).toBeNull();
    expect(screen.queryByText("1234")).toBeNull();
  });

  it("shows all cost keys when view_cost_fields is granted", () => {
    granted.add("view_cost_fields");

    render(
      <ActivityLogDetailPanel
        entry={baseEntry}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Batch Number")).toBeTruthy();
    expect(screen.getByText("Previous Cost Price")).toBeTruthy();
    expect(screen.getByText("Cost Price")).toBeTruthy();
    expect(screen.getByText("Counted Cost Price")).toBeTruthy();
    expect(screen.getByText("Unit Cost")).toBeTruthy();
    expect(screen.getByText("Total Cost")).toBeTruthy();

    expect(screen.getByText("Selling Price")).toBeTruthy();
    expect(screen.getAllByText("1750").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1500").length).toBeGreaterThan(0);
    expect(screen.getByText("35000")).toBeTruthy();

    expect(screen.queryByText("Pin")).toBeNull();
  });

  it("shows 'No further details recorded.' if only cost keys and internal keys were present and view_cost_fields is withheld", () => {
    const costOnlyEntry: AuditLogRow = {
      ...baseEntry,
      details: JSON.stringify({
        id: "batch-101",
        cost_price: 2000,
        previous_cost_price: 1800,
      }),
    };

    render(
      <ActivityLogDetailPanel
        entry={costOnlyEntry}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("No further details recorded.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/2000|1800/);
  });

  it("masks cost fields in raw unparseable details when view_cost_fields is withheld", () => {
    const rawEntry: AuditLogRow = {
      ...baseEntry,
      details: 'Unparseable { "cost_price": 5000, "reason": "damaged" }',
    };

    render(
      <ActivityLogDetailPanel
        entry={rawEntry}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.textContent).toContain('"cost_price": [hidden]');
    expect(document.body.textContent).not.toContain("5000");
  });

  it("displays raw unparseable details as-is when view_cost_fields is granted", () => {
    granted.add("view_cost_fields");
    const rawEntry: AuditLogRow = {
      ...baseEntry,
      details: 'Unparseable { "cost_price": 5000, "reason": "damaged" }',
    };

    render(
      <ActivityLogDetailPanel
        entry={rawEntry}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.textContent).toContain('"cost_price": 5000');
  });
});
