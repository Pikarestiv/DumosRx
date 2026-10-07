import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuckItemActions } from "@/components/admin/stores/details/stuck-item-actions";

const { commands, issueMutate } = vi.hoisted(() => ({
  commands: { rows: [] as Array<Record<string, unknown>> },
  issueMutate: vi.fn(),
}));

vi.mock("@/lib/api/admin-hooks-sync", () => ({
  useIssueSyncCommandMutation: () => ({ mutate: issueMutate, isPending: false }),
  useStoreSyncCommands: () => ({ data: { commands: commands.rows } }),
}));

const { authState } = vi.hoisted(() => ({
  authState: { user: { role: "super_admin" } as { role: string } | null },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));

const item = (table: string) => ({
  table_name: table,
  record_id: "r1",
  attempts: 7,
  reason: "forbidden",
});

describe("StuckItemActions", () => {
  beforeEach(() => {
    authState.user = { role: "super_admin" };
    commands.rows = [];
    issueMutate.mockClear();
  });

  const pendingCommand = (overrides: Record<string, unknown> = {}) => ({
    id: "c1",
    device_id: "D1",
    action: "retry",
    table_name: "feedback",
    record_id: "r1",
    status: "pending",
    result: null,
    issued_at: "2026-10-07T10:00:00Z",
    acted_at: null,
    ...overrides,
  });

  /**
   * A command applies on the device's next sync, which may be hours away or
   * never. Without this the operator reloads, sees an ordinary Retry button
   * and fires it again - the spec's "distinguishes queued from applied".
   */
  it("says a command is already queued for this exact row instead of offering it again", () => {
    commands.rows = [pendingCommand()];

    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />);

    expect(screen.getByText(/retry queued/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("still offers Retry when the pending command belongs to a different row", () => {
    commands.rows = [pendingCommand({ record_id: "someone-else" })];

    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />);

    expect(screen.getByRole("button", { name: /^retry$/i })).toBeDefined();
  });

  it("still offers Retry when the pending command belongs to a different device", () => {
    commands.rows = [pendingCommand({ device_id: "D2" })];

    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />);

    expect(screen.getByRole("button", { name: /^retry$/i })).toBeDefined();
  });

  /** An applied command is history; the row being still stuck means try again. */
  it("offers Retry again once the device has acted on the previous command", () => {
    commands.rows = [pendingCommand({ status: "applied", acted_at: "2026-10-07T11:00:00Z" })];

    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />);

    expect(screen.getByRole("button", { name: /^retry$/i })).toBeDefined();
  });

  it("hides Abandon too while a command for that row is still queued", () => {
    commands.rows = [pendingCommand({ action: "abandon" })];

    render(<StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />);

    expect(screen.getByText(/abandon queued/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /abandon/i })).toBeNull();
  });

  /**
   * Both command routes are role:super_admin while the panel itself is
   * view_platform_health, so a delegated operator would otherwise see
   * buttons that only ever return a refusal.
   */
  it("renders nothing for a delegated operator who is not a super admin", () => {
    authState.user = { role: "platform_admin" };

    const { container } = render(
      <StuckItemActions storeId="s1" deviceId="D1" item={item("feedback")} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
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
