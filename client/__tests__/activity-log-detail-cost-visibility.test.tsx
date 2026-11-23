import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActivityLogDetailPanel } from "@/components/activity-log/activity-log-detail-panel";
import type { AuditLogRow } from "@/lib/types/audit-log";

const granted = new Set<string>();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
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

  it("hides every cost-named column, including stock audit and purchase order line fields", () => {
    const entry = {
      ...baseEntry,
      details: JSON.stringify({
        expected_cost_price: 100,
        actual_cost_price: 120,
        cost_price_difference: 20,
        cost_price_override: 130,
        points_cost: 500,
        batch_number: "B-9",
      }),
    };
    render(<ActivityLogDetailPanel entry={entry} onClose={vi.fn()} />);

    expect(screen.queryByText("Expected Cost Price")).toBeNull();
    expect(screen.queryByText("Actual Cost Price")).toBeNull();
    expect(screen.queryByText("Cost Price Difference")).toBeNull();
    expect(screen.queryByText("Cost Price Override")).toBeNull();
    expect(screen.getByText("Points Cost")).toBeTruthy();
    expect(screen.getByText("B-9")).toBeTruthy();
  });

  it("formats table labels, hides client_id, and serializes object values cleanly", () => {
    render(
      <ActivityLogDetailPanel
        entry={{
          ...baseEntry,
          table_name: "stock_batches",
          details: JSON.stringify({
            client_id: "client-uuid-1",
            batch_number: "B-900",
            metadata: { source: "import", count: 3 },
          }),
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Stock Batch")).toBeTruthy();
    expect(screen.queryByText("Client Id")).toBeNull();
    expect(screen.getByText('{"source":"import","count":3}')).toBeTruthy();
  });

  it("expands related actions inline as an accordion, shows timestamps, formats ISO dates, and shows product name", () => {
    const related: AuditLogRow[] = [
      {
        id: "rel-1",
        action: "INSERT",
        table_name: "stock_movements",
        record_id: "mv-1",
        user_name: "John Doe",
        created_at: "2026-11-21T07:37:43.409Z",
        product_name: "paracetamol 500mg",
        details: JSON.stringify({
          movement_type: "sale",
          quantity: -2,
          product_id: "prod-1",
          movement_date: "2026-11-21T07:37:43.409Z",
          reason: "POS Sale #101",
        }),
      },
    ];

    render(
      <ActivityLogDetailPanel
        entry={baseEntry}
        relatedEntries={related}
        onClose={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Stock sale \(-2\): Paracetamol 500mg/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toMatch(/21\/11\/2026 \d{2}:\d{2}/);
    expect(screen.queryByText("POS Sale #101")).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("POS Sale #101")).toBeTruthy();
    const productEl = screen.getByText("paracetamol 500mg");
    expect(productEl.className).toContain("capitalize");
    expect(screen.queryByText("2026-11-21T07:37:43.409Z")).toBeNull();
    expect(screen.getByText("1/1 viewed")).toBeTruthy();
  });
});
