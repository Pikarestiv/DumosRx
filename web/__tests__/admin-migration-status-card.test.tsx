import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MigrationStatusCardView } from "@/components/admin/operations/migration-status-card";
import type { AdminMigrationStatus } from "@/lib/types/admin";

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const ok = (over: Partial<AdminMigrationStatus> = {}): AdminMigrationStatus => ({
  status: "ok",
  pending: [],
  pending_count: 0,
  last_batch: 7,
  error: null,
  ...over,
});

describe("MigrationStatusCardView", () => {
  it("reports how many migrations are pending", () => {
    render(
      <MigrationStatusCardView
        data={ok({ pending: [{ name: "m1", alters_existing_data: false }], pending_count: 1 })}
      />,
    );

    expect(screen.getByText(/1 migration pending/i)).toBeDefined();
  });

  it("pluralises more than one", () => {
    render(
      <MigrationStatusCardView
        data={ok({
          pending: [
            { name: "m1", alters_existing_data: false },
            { name: "m2", alters_existing_data: true },
          ],
          pending_count: 2,
        })}
      />,
    );

    expect(screen.getByText(/2 migrations pending/i)).toBeDefined();
  });

  it("says the schema is up to date when nothing is pending", () => {
    render(<MigrationStatusCardView data={ok()} />);

    expect(screen.getByText(/up to date/i)).toBeDefined();
  });

  /**
   * Phase 1's rule, and the exact false statement A-170 consisted of: "0
   * pending" is indistinguishable from "all good", so an unknown status must
   * never be able to render as a count.
   */
  it("renders unavailable rather than zero pending when the status is unknown", () => {
    render(
      <MigrationStatusCardView
        data={ok({ status: "unknown", pending_count: null, last_batch: null, error: "no such table: migrations" })}
      />,
    );

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/up to date/i)).toBeNull();
    expect(screen.queryByText(/0 migrations pending/i)).toBeNull();
  });

  it("does not crash before the payload arrives", () => {
    render(<MigrationStatusCardView data={undefined} />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });
});
