import { describe, it, expect } from "vitest";
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

/**
 * Items 1+2: every Report Center report returns the same generic
 * Record<string, unknown> row shape, so one column-driven table renders all
 * six on screen. The only real logic here is the comparator - a numeric
 * column must not sort as text ("1200" before "80").
 */
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

  it("shows an empty state rather than a headerless table", () => {
    render(<ReportTableView rows={[]} headers={["Cashier"]} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nothing to show")).toBeTruthy();
  });
});
