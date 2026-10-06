import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { ReportCard } from "@/components/reports/report-card";

/**
 * A-158: the report icon sat in its own flex column spanning the full
 * height of the card, alongside title/description/buttons together - so the
 * button row (View/Export/Print) only had the card's width minus the
 * icon's column to work with, and Print wrapped to a second line on a
 * narrower screen. Reported live from a real store's older/smaller laptop
 * screen. Moving the icon into the title row instead (icon-title-tag as one
 * row, with description and the button row spanning the card's full width
 * beneath it) gives the button row the extra ~52px it needs.
 */
describe("ReportCard layout", () => {
  it("renders the report icon in the title row, not as a full-height column beside the button row", () => {
    render(
      <ReportCard
        report={{
          id: "sales",
          title: "Detailed Sales Report",
          description: "Itemized list of all transactions.",
          icon: FileText,
          category: "Financial",
        }}
        note={undefined}
        isLoading={false}
        canExportReports={true}
        onView={vi.fn()}
        onExportPdf={vi.fn()}
        onExportCsv={vi.fn()}
        onPrint={vi.fn()}
      />,
    );

    const titleRow = screen.getByText("Detailed Sales Report").closest("div");
    expect(titleRow).not.toBeNull();
    expect(titleRow!.querySelector("svg")).not.toBeNull();

    const viewButton = screen.getByRole("button", { name: /view/i });
    expect(titleRow!.contains(viewButton)).toBe(false);
  });
});
