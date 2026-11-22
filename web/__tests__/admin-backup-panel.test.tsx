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

  it("renders last backup run status, trigger, timestamp, and failure error when present", async () => {
    const failedStatus: AdminBackupStatus = {
      configured: true,
      bucket_configured: true,
      public_key_configured: true,
      disk: "r2_backups",
      schedule: "Daily at 23:00 Africa/Lagos",
      last_run: {
        status: "failed",
        trigger: "scheduled",
        ran_at: "2026-11-22T08:15:00Z",
        key: null,
        bytes: null,
        monthly_key: null,
        error: "R2 upload timed out",
      },
      recent_backups: [],
      list_error: null,
    };
    requestMock.mockResolvedValueOnce(failedStatus);

    renderPanel();

    expect(await screen.findByText(/failed · scheduled/i)).toBeDefined();
    expect(screen.getByText(/22\/11\/2026 \d{2}:\d{2}/)).toBeDefined();
    expect(screen.getByText("R2 upload timed out")).toBeDefined();
  });

  it("toggles automatic backups into manual mode and sends updated schedule", async () => {
    const enabledStatus: AdminBackupStatus = {
      configured: true,
      bucket_configured: true,
      public_key_configured: true,
      disk: "r2_backups",
      schedule: "Daily at 23:00 Africa/Lagos",
      schedule_enabled: true,
      schedule_frequency: "daily",
      recent_backups: [],
      list_error: null,
    };
    const manualStatus: AdminBackupStatus = {
      ...enabledStatus,
      schedule: "Manual only (scheduled backups paused)",
      schedule_enabled: false,
    };

    requestMock
      .mockResolvedValueOnce(enabledStatus)
      .mockResolvedValueOnce({
        ok: true,
        schedule_enabled: false,
        schedule_frequency: "daily",
        status_after: manualStatus,
      })
      .mockResolvedValueOnce(manualStatus);

    renderPanel();

    const toggle = await screen.findByRole("switch", { name: /automatic scheduled backups/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith("admin/maintenance/backup/schedule", {
        method: "PUT",
        body: JSON.stringify({ enabled: false, frequency: "daily" }),
      });
    });
    expect(await screen.findByText(/manual mode only/i)).toBeDefined();
  });
});
