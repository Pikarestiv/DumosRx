import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mediaState = { isDesktop: false };

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => mediaState.isDesktop,
}));

import { ReportTableView } from "@/components/reports/report-table-view";

const sampleRows = [
  { Customer: "Adaeze", Phone: "+234 802", Loyalty: 173 },
  { Customer: "Bello", Phone: "+234 805", Loyalty: 10 },
];

describe("ReportTableView responsive rendering", () => {
  beforeEach(() => {
    mediaState.isDesktop = false;
  });

  it("renders cards without a horizontally scrolling table on mobile (< 1024px) and supports row drill-down", () => {
    const onRowClick = vi.fn();
    render(
      <ReportTableView
        rows={sampleRows}
        headers={["Customer", "Phone", "Loyalty"]}
        onRowClick={onRowClick}
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByLabelText("Sort report rows")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Adaeze/i }));
    expect(onRowClick).toHaveBeenCalledWith(sampleRows[0]);
  });

  it("renders the desktop grid table at 1024px and wider", () => {
    mediaState.isDesktop = true;
    render(
      <ReportTableView
        rows={sampleRows}
        headers={["Customer", "Phone", "Loyalty"]}
      />,
    );

    expect(screen.getByRole("table", { name: "Report rows" })).toBeTruthy();
  });
});
