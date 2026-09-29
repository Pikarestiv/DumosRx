import { describe, it, expect, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecentDownloadsList } from "@/components/reports/recent-downloads-list";
import type { RecentDownload } from "@/lib/hooks/use-report-export";

function makeDownloads(count: number): RecentDownload[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `dl-${i}`,
    name: `Report ${i}`,
    type: "CSV",
    generatedAt: new Date(2026, 0, i + 1).toISOString(),
    sizeLabel: "1 KB",
  }));
}

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("RecentDownloadsList", () => {
  it("shows only the 4 most recent downloads by default when more exist", () => {
    render(React.createElement(RecentDownloadsList, { downloads: makeDownloads(10) }));
    const names = Array.from(container.querySelectorAll("p")).map((p) => p.textContent);
    expect(names).toContain("Report 0");
    expect(names).toContain("Report 3");
    expect(names).not.toContain("Report 4");
    expect(names).not.toContain("Report 9");
  });

  it("shows every download when there are fewer than the limit", () => {
    render(React.createElement(RecentDownloadsList, { downloads: makeDownloads(2) }));
    expect(container.textContent).toContain("Report 0");
    expect(container.textContent).toContain("Report 1");
  });

  it("honors an explicit limit override", () => {
    render(React.createElement(RecentDownloadsList, { downloads: makeDownloads(10), limit: 3 }));
    const names = Array.from(container.querySelectorAll("p")).map((p) => p.textContent);
    expect(names).toContain("Report 2");
    expect(names).not.toContain("Report 3");
  });
});
