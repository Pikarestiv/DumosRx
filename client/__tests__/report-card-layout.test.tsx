import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { ReportCard } from "@/components/reports/report-card";

// A-158: the report icon sat in its own flex column spanning the full height of the card, alongside title/description/butt…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-card-layout-test-tsx-L7
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
    if (!titleRow) throw new Error("report title has no enclosing row");
    expect(titleRow.querySelector("svg")).not.toBeNull();

    const viewButton = screen.getByRole("button", { name: /view/i });
    expect(titleRow.contains(viewButton)).toBe(false);
  });
});
