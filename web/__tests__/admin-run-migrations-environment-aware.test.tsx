import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { env } = vi.hoisted(() => ({
  env: { value: { environmentName: "Production", isProduction: true } },
}));

vi.mock("@/hooks/use-api-environment", () => ({
  useApiEnvironmentName: () => env.value,
}));

const { RunMigrationsDialog } = await import(
  "@/components/admin/maintenance/run-migrations-dialog"
);

const pending = [
  { name: "2026_01_01_000000_add_col", alters_existing_data: false },
  { name: "2026_01_01_000001_drop_col", alters_existing_data: true },
];

/**
 * The dialog warned about "the production database" regardless of which API
 * the session was pointed at, so running migrations on dev.dumosrx.com read
 * as if it were about to touch live customer data. A warning that overstates
 * is trained through just as fast as one that understates.
 */
describe("RunMigrationsDialog environment awareness", () => {
  beforeEach(() => {
    env.value = { environmentName: "Production", isProduction: true };
  });

  const renderDialog = () =>
    render(
      <RunMigrationsDialog
        open
        pending={pending}
        isPending={false}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />,
    );

  it("names the production database when pointed at production", () => {
    renderDialog();

    expect(screen.getByText(/production database/i)).toBeDefined();
  });

  it("names the staging database instead when pointed at staging", () => {
    env.value = { environmentName: "Staging / Dev", isProduction: false };

    renderDialog();

    expect(screen.getByText(/staging \/ dev database/i)).toBeDefined();
    expect(screen.queryByText(/production database/i)).toBeNull();
  });

  /** The irreversibility warning is about the host, not the environment label. */
  it("still warns that a destructive migration cannot be rolled back, on any environment", () => {
    env.value = { environmentName: "Staging / Dev", isProduction: false };

    renderDialog();

    expect(screen.getByText(/cannot be rolled back/i)).toBeDefined();
  });

  /** Off production, "take a backup first" is noise rather than caution. */
  it("only urges a backup when it is really production", () => {
    env.value = { environmentName: "Staging / Dev", isProduction: false };
    const { unmount } = renderDialog();

    expect(screen.queryByText(/take a database backup first/i)).toBeNull();
    unmount();

    env.value = { environmentName: "Production", isProduction: true };
    renderDialog();

    expect(screen.getByText(/take a database backup first/i)).toBeDefined();
  });
});
