import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunMigrationsDialog } from "@/components/admin/maintenance/run-migrations-dialog";
import type { PendingMigration } from "@/lib/types/admin";

const noop = () => {};

const render_ = (pending: PendingMigration[]) =>
  render(
    <RunMigrationsDialog
      open
      pending={pending}
      isPending={false}
      onOpenChange={noop}
      onConfirm={noop}
    />,
  );

describe("RunMigrationsDialog", () => {
  it("names the count and warns specifically when a migration alters existing data", () => {
    render_([
      { name: "2026_01_01_000000_add_col", alters_existing_data: false },
      { name: "2026_01_01_000001_drop_col", alters_existing_data: true },
    ]);

    expect(screen.getByText(/2 pending/i)).toBeDefined();
    expect(screen.getByText(/alter or remove existing data/i)).toBeDefined();
    expect(screen.getByText(/cannot be rolled back/i)).toBeDefined();
  });

  /**
   * A confirmation that always shows the worst-case warning trains the
   * operator to click through it, which is the same as having no warning.
   */
  it("omits the destructive warning when every pending migration is additive", () => {
    render_([{ name: "2026_01_01_000000_add_col", alters_existing_data: false }]);

    expect(screen.queryByText(/alter or remove existing data/i)).toBeNull();
    expect(screen.getByText(/1 pending/i)).toBeDefined();
  });

  it("never uses a native confirm", () => {
    render_([{ name: "m1", alters_existing_data: false }]);

    expect(screen.getByRole("alertdialog")).toBeDefined();
  });
});
