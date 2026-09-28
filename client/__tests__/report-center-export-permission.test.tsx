import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let granted = true;

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => (key === "export_reports" ? granted : true),
}));
// One frozen object for every render: ReportCenter's refreshRecent
// useCallback depends on getRecentDownloads, so a fresh identity per render
// would re-fire its useEffect -> setState -> render loop until the heap dies.
const reportExport = {
  getRows: vi.fn().mockResolvedValue([]),
  exportReportCsv: vi.fn(),
  downloadReportPdf: vi.fn(),
  printReport: vi.fn(),
  getRecentDownloads: () => [],
};
vi.mock("@/lib/hooks/use-report-export", () => ({
  useReportExport: () => reportExport,
  getReportNote: () => undefined,
  getReportHeaders: () => [],
}));
vi.mock("@/components/reports/report-filters-bar", () => ({
  ReportFiltersBar: () => React.createElement("div"),
}));

async function renderCenter() {
  const { ReportCenter } = await import("@/components/reports/report-center");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ReportCenter));
  });
  return { container, root };
}

const buttonsLabelled = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.trim() === text);

describe("Report Center export gating", () => {
  beforeEach(() => {
    granted = true;
  });

  it("renders Export and Print actions for a user with export_reports", async () => {
    const { container, root } = await renderCenter();
    expect(buttonsLabelled(container, "Export").length).toBeGreaterThan(0);
    expect(buttonsLabelled(container, "Print").length).toBeGreaterThan(0);
    act(() => root.unmount());
    container.remove();
  });

  it("hides Export and Print but keeps View for a user without export_reports", async () => {
    granted = false;
    const { container, root } = await renderCenter();
    expect(buttonsLabelled(container, "Export")).toHaveLength(0);
    expect(buttonsLabelled(container, "Print")).toHaveLength(0);
    expect(buttonsLabelled(container, "View").length).toBeGreaterThan(0);
    act(() => root.unmount());
    container.remove();
  });
});
