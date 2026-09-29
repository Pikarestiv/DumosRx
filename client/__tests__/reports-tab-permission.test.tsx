import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * "view_reports" answers "does the Report Center / Analytics half of the
 * Reports page exist for this role at all". It replaces the isAdmin gate
 * those two tabs carried, which widens them to a read-only auditor - the
 * reports-focused role that has held view_reports by default since the
 * catalog was written and could not reach a single report.
 *
 * Daily Close is deliberately NOT under this key: every role, cashiers
 * included, reaches it by design.
 */

const hasPermission = vi.fn((_key: string) => true);
const push = vi.fn();
let tabParam: string | null = null;

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => tabParam }),
}));
vi.mock("next/dynamic", () => ({
  default: () => function AnalyticsStub() {
    return <div>analytics-panel</div>;
  },
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ t: (s: string) => s, storeType: "retail" }),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAdmin: false }),
}));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: () => <input aria-label="report date" />,
}));
vi.mock("@/components/dashboard/locked-module-overlay", () => ({
  LockedModuleOverlay: () => null,
}));
vi.mock("@/components/reports/report-center", () => ({
  ReportCenter: () => <div>report-center-panel</div>,
}));
vi.mock("@/components/reports/daily-close-report", () => ({
  DailyCloseReport: () => <div>daily-close-panel</div>,
}));

import ReportsPage from "@/app/(dashboard)/reports/page";

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

describe("Reports page view_reports permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    push.mockReset();
    tabParam = null;
  });

  it("checks the view_reports key specifically", () => {
    render(<ReportsPage />);
    expect(hasPermission).toHaveBeenCalledWith("view_reports");
  });

  it("offers Operational Reports and Analytics with the key", () => {
    render(<ReportsPage />);
    expect(screen.queryByText("Operational Reports")).not.toBeNull();
    expect(screen.queryByText("Analytics & Insights")).not.toBeNull();
    expect(screen.queryByText("report-center-panel")).not.toBeNull();
  });

  it("hides both tabs without view_reports, keeping Daily Close", () => {
    deny("view_reports");
    render(<ReportsPage />);
    expect(screen.queryByText("Operational Reports")).toBeNull();
    expect(screen.queryByText("Analytics & Insights")).toBeNull();
    expect(screen.queryByText("Daily Close")).not.toBeNull();
    expect(screen.queryByText("daily-close-panel")).not.toBeNull();
  });

  it("falls back to Daily Close on ?tab=reports without the key", () => {
    deny("view_reports");
    tabParam = "reports";
    render(<ReportsPage />);
    expect(screen.queryByText("report-center-panel")).toBeNull();
    expect(screen.queryByText("daily-close-panel")).not.toBeNull();
  });

  it("falls back to Daily Close on ?tab=analytics without the key", () => {
    deny("view_reports");
    tabParam = "analytics";
    render(<ReportsPage />);
    expect(screen.queryByText("analytics-panel")).toBeNull();
    expect(screen.queryByText("daily-close-panel")).not.toBeNull();
  });

  it("opens Analytics on ?tab=analytics with the key", () => {
    tabParam = "analytics";
    render(<ReportsPage />);
    expect(screen.queryByText("analytics-panel")).not.toBeNull();
  });
});
