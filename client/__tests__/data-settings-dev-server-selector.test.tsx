import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataSettings } from "../components/settings/data-settings";

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canCloudSync: true,
    minimumSyncIntervalMinutes: 15,
    withRestriction: (fn: () => void) => fn,
    getUpgradeMessage: () => "",
  }),
}));

vi.mock("@/components/ui/server-selector", () => ({
  ServerSelector: () => <button>Server Config</button>,
}));

const baseProps = {
  isCloudLinked: false,
  handleSync: vi.fn(),
  handleForceFullResync: vi.fn(),
  handleReconcileStockQuantities: vi.fn(),
  setIsCloudLinkOpen: vi.fn(),
  handleDownloadBackup: vi.fn(),
  handleRestoreBackup: vi.fn(),
  handleRestoreBackupTauri: vi.fn(),
  isTauri: false,
  autoSyncEnabled: false,
  setAutoSyncEnabled: vi.fn(),
  autoSyncInterval: "15",
  setAutoSyncInterval: vi.fn(),
  handleSaveAutoSyncSettings: vi.fn(),
};

/**
 * Settings > Data is the only place to repoint the API server once signed
 * in: ServerSelector also renders on the pre-login landing page
 * (app/page.tsx), but a device that's logged in before skips straight to
 * /dashboard and never sees that page again.
 */
describe("DataSettings dev-only API server control", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv ?? "test");
  });

  it("shows the API server control outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    render(<DataSettings {...baseProps} />);

    expect(screen.getByText("Developer")).toBeTruthy();
    expect(screen.getByText("API Server")).toBeTruthy();
    expect(screen.getByText("Server Config")).toBeTruthy();
  });

  it("hides the API server control in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");

    render(<DataSettings {...baseProps} />);

    expect(screen.queryByText("Developer")).toBeNull();
    expect(screen.queryByText("API Server")).toBeNull();
  });
});
