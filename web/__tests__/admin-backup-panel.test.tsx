import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DatabaseBackupPanel } from "@/components/admin/maintenance/database-backup-panel";
import type { AdminBackupRunResult, AdminBackupStatus } from "@/lib/types/admin";

const requestMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  webApiClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

vi.mock("@/lib/api/query-scope", () => ({
  useScopedKey: (key: string[]) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DatabaseBackupPanel />
    </QueryClientProvider>,
  );
}

describe("DatabaseBackupPanel", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("explains missing R2 configuration and disables manual run when unconfigured", async () => {
    const unconfigured: AdminBackupStatus = {
      configured: false,
      bucket_configured: false,
      public_key_configured: true,
      disk: "r2_backups",
      schedule: "Daily at 23:00 Africa/Lagos",
      recent_backups: [],
      list_error: null,
    };
    requestMock.mockResolvedValueOnce(unconfigured);

    renderPanel();

    expect(
      await screen.findByText(/nightly scheduled backups skip silently/i),
    ).toBeDefined();
    expect(screen.getByText(/r2 bucket: missing/i)).toBeDefined();
    expect(screen.getByText(/encryption key: configured/i)).toBeDefined();
    const button = screen.getByRole("button", { name: /run backup now/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("lists recent backups with date and time and runs a manual backup after confirmation", async () => {
    const configuredStatus: AdminBackupStatus = {
      configured: true,
      bucket_configured: true,
      public_key_configured: true,
      disk: "r2_backups",
      schedule: "Daily at 23:00 Africa/Lagos",
      recent_backups: [
        {
          key: "daily/2026/20261121-230000.sql.gz.enc",
          bytes: 20480,
          last_modified: "2026-11-21T23:00:00Z",
        },
      ],
      list_error: null,
    };
    const runResult: AdminBackupRunResult = {
      ok: true,
      output: "Wrote daily/2026/20261122-090000.sql.gz.enc (20480 bytes).",
      result: {
        key: "daily/2026/20261122-090000.sql.gz.enc",
        bytes: 20480,
        monthly_key: null,
      },
      status_after: configuredStatus,
    };

    requestMock
      .mockResolvedValueOnce(configuredStatus)
      .mockResolvedValueOnce(runResult)
      .mockResolvedValueOnce(configuredStatus);

    renderPanel();

    expect(
      await screen.findByText("daily/2026/20261121-230000.sql.gz.enc"),
    ).toBeDefined();
    expect(screen.getByText(/21\/11\/2026 \d{2}:\d{2}/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /run backup now/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^run backup$/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Wrote daily/2026/20261122-090000.sql.gz.enc (20480 bytes)."),
      ).toBeDefined();
    });
  });
});
