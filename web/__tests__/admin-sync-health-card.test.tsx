import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncHealthCard } from "@/components/admin/operations/sync-health-card";

const base = {
  success_rate_today: "90%",
  success_rate_7d: "95%",
  failures_by_reason: {},
  worst_stores: [],
};

describe("SyncHealthCard", () => {
  it("shows the recorded success rate", () => {
    render(<SyncHealthCard data={base} isLoading={false} />);

    expect(screen.getByText("90%")).toBeDefined();
  });

  it("reports no sync activity rather than zero when nothing has synced", () => {
    render(
      <SyncHealthCard
        data={{ ...base, success_rate_today: null, success_rate_7d: null }}
        isLoading={false}
      />,
    );

    expect(screen.getAllByText(/no sync activity/i)).toHaveLength(2);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("glosses a raw reason string in plain English and keeps the raw string visible", () => {
    render(
      <SyncHealthCard
        data={{ ...base, failures_by_reason: { permission_denied: 3 } }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/no access to that store/i)).toBeDefined();
    expect(screen.getByText(/permission_denied/)).toBeDefined();
  });

  it("falls back to the raw string for a reason it does not recognise", () => {
    render(
      <SyncHealthCard
        data={{ ...base, failures_by_reason: { some_new_reason: 1 } }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/some_new_reason/)).toBeDefined();
  });

  it("names the worst affected stores", () => {
    render(
      <SyncHealthCard
        data={{
          ...base,
          worst_stores: [{ store_id: "s1", store_name: "Ikeja Branch", refused: 12 }],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText("Ikeja Branch")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
  });

  it("does not crash when the payload is missing entirely", () => {
    render(<SyncHealthCard data={undefined} isLoading={false} />);

    expect(screen.getAllByText(/no sync activity/i).length).toBeGreaterThan(0);
  });
});
