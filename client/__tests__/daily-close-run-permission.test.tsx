import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);
const handleDownloadBackup = vi.fn(async () => {});
const handleSync = vi.fn(async (_force?: boolean) => {});

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ handleDownloadBackup, handleSync }),
}));

import { DailyCloseHeader } from "@/components/reports/daily-close/daily-close-header";

// "Run Daily Close (End of Day)" is not a ledger-locking write in this app — the close IS securing the day's data:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-daily-close-run-permission-test-tsx-L18
describe("Daily Close run permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers the close actions to a user with run_daily_close", () => {
    render(<DailyCloseHeader reportDate="2026-09-28" />);
    expect(
      screen.getByRole("button", { name: /Download Local Backup/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cloud Sync Now/ })).toBeTruthy();
  });

  it("hides both close actions from a user without run_daily_close", () => {
    hasPermission.mockImplementation((key: string) => key !== "run_daily_close");
    render(<DailyCloseHeader reportDate="2026-09-28" />);
    expect(
      screen.queryByRole("button", { name: /Download Local Backup/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Cloud Sync Now/ })).toBeNull();
  });

  it("still shows the end-of-day banner itself without the key", () => {
    hasPermission.mockImplementation((key: string) => key !== "run_daily_close");
    render(<DailyCloseHeader reportDate="2026-09-28" />);
    expect(screen.getByText(/Daily Close Ready/)).toBeTruthy();
    expect(screen.getByText(/end of day reconciliation/)).toBeTruthy();
  });

  it("checks the run_daily_close key specifically", () => {
    render(<DailyCloseHeader reportDate="2026-09-28" />);
    expect(hasPermission).toHaveBeenCalledWith("run_daily_close");
  });

  it("renders the report date as a long day-first string, not the raw YYYY-MM-DD", () => {
    render(<DailyCloseHeader reportDate="2026-09-28" />);
    expect(screen.getByText(/28th September, 2026/)).toBeTruthy();
    expect(screen.queryByText(/2026-09-28/)).toBeNull();
  });
});
