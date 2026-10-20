import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ReportTableView } from "@/components/reports/report-table-view";

const rows = [
  { Cashier: "Ada Obi", Total: 900 },
  { Cashier: "Chidi", Total: 1200 },
  { Cashier: "Bola", Total: 80 },
];

function bodyCells(column: number) {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[column].textContent);
}

// Items 1+2: every Report Center report returns the same generic Record<string, unknown> row shape, so one column-driven t…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-table-view-sorting-test-tsx-L19
describe("ReportTableView", () => {
  it("renders a column per configured header", () => {
    render(<ReportTableView rows={rows} headers={["Cashier", "Total"]} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Cashier", "Total"]);
  });

  it("sorts a numeric column numerically, and flips direction on a second click", () => {
    render(<ReportTableView rows={rows} headers={["Cashier", "Total"]} />);
    const totalHeader = screen.getByRole("button", { name: /Total/ });

    fireEvent.click(totalHeader);
    expect(bodyCells(1)).toEqual(["80", "900", "1200"]);

    fireEvent.click(totalHeader);
    expect(bodyCells(1)).toEqual(["1200", "900", "80"]);
  });

  it("sorts a text column alphabetically", () => {
    render(<ReportTableView rows={rows} headers={["Cashier", "Total"]} />);
    fireEvent.click(screen.getByRole("button", { name: /Cashier/ }));
    expect(bodyCells(0)).toEqual(["Ada Obi", "Bola", "Chidi"]);
  });

  it("falls back to the first row's keys when no headers are configured", () => {
    render(<ReportTableView rows={rows} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Cashier",
      "Total",
    ]);
  });

  it("opens a row by click and by keyboard when the report drills down", () => {
    const onRowClick = vi.fn();
    render(
      <ReportTableView
        rows={rows}
        headers={["Cashier", "Total"]}
        onRowClick={onRowClick}
      />,
    );
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows.every((row) => row.getAttribute("tabindex") === "0")).toBe(true);

    fireEvent.click(bodyRows[0]);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[0]);

    fireEvent.keyDown(bodyRows[1], { key: "Enter" });
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);

    fireEvent.keyDown(bodyRows[2], { key: " " });
    expect(onRowClick).toHaveBeenLastCalledWith(rows[2]);
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it("passes the row the user actually clicked after a re-sort", () => {
    const onRowClick = vi.fn();
    render(
      <ReportTableView
        rows={rows}
        headers={["Cashier", "Total"]}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Total/ }));
    fireEvent.click(screen.getAllByRole("row")[1]);
    expect(onRowClick).toHaveBeenCalledWith(rows[2]);
  });

  it("leaves rows unfocusable and unclickable for a report without a drill-down", () => {
    render(<ReportTableView rows={rows} headers={["Cashier", "Total"]} />);
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows.some((row) => row.hasAttribute("tabindex"))).toBe(false);
    expect(bodyRows.some((row) => row.className.includes("cursor-pointer"))).toBe(
      false,
    );
  });

  it("shows an empty state rather than a headerless table", () => {
    render(<ReportTableView rows={[]} headers={["Cashier"]} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nothing to show")).toBeTruthy();
  });
});
