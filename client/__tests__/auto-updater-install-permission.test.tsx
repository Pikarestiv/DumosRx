import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * install_app_updates gates the updater's USER-FACING half: the floating
 * "Check for updates" pill and the consent/restart prompts it can open.
 * The startup check and the silent patch download behind it are deliberately
 * left running for every session - they are not a user action, and stopping
 * them would strand a till on an old build rather than restrict anyone.
 *
 * A session with no signed-in user (login screen, first run) is ungated:
 * there is no group to check, and the updater is the device's own.
 */

const hasPermission = vi.fn((_key: string) => true);
let currentUser: { role: string } | null = { role: "sales_staff" };
let tauri = true;

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: currentUser }),
}));
vi.mock("@/lib/db/core", () => ({ isTauri: () => tauri }));
vi.mock("@/lib/utils/error-logger", () => ({ logCrash: vi.fn() }));
vi.mock("@/lib/constants", () => ({
  DOWNLOAD_URL: "https://example.com/download",
  UPDATER_JSON_URL: "https://example.com/updater.json",
}));
vi.mock("@tauri-apps/plugin-os", () => ({ type: () => "macos" }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: async () => null }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "1.0.0" }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: async () => {} }));

import { AutoUpdater } from "@/components/tauri/auto-updater";

describe("AutoUpdater install_app_updates permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    currentUser = { role: "sales_staff" };
    tauri = true;
  });

  it("checks the install_app_updates key specifically", () => {
    render(<AutoUpdater />);
    expect(hasPermission).toHaveBeenCalledWith("install_app_updates");
  });

  it("offers the manual update check to a session holding the key", async () => {
    render(<AutoUpdater />);
    await waitFor(() =>
      expect(screen.queryByText("Check for updates")).not.toBeNull(),
    );
  });

  it("shows no updater UI to a signed-in session without the key", async () => {
    hasPermission.mockImplementation((key: string) => key !== "install_app_updates");
    const { container } = render(<AutoUpdater />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("stays available with no signed-in user, since there is no group to check", async () => {
    hasPermission.mockImplementation((key: string) => key !== "install_app_updates");
    currentUser = null;
    render(<AutoUpdater />);
    await waitFor(() =>
      expect(screen.queryByText("Check for updates")).not.toBeNull(),
    );
  });
});
