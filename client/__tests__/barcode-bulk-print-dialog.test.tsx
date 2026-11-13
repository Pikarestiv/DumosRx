import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BarcodeBulkPrintDialog } from "@/components/stock-batch/barcode-bulk-print-dialog";
import { buildLabelHtml } from "@/components/stock-batch/barcode-label-markup";

const printer = vi.hoisted(() => ({ jobs: [] as { html: string }[] }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 1, currency: "NGN" } }),
}));
vi.mock("@/lib/utils/print-node", () => ({
  printNode: (node: HTMLElement) => {
    printer.jobs.push({ html: node.innerHTML });
    return Promise.resolve();
  },
}));

const products = [
  { id: "p1", name: "Paracetamol", barcode: "5901234123457", unit_price: 1250 },
  { id: "p2", name: "Amoxicillin <b>", unit_price: 900 },
  { id: "p3", name: "Vitamin C", barcode: "4006381333931", unit_price: 2250 },
];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    { measureText: () => ({ width: 5 }) } as unknown as CanvasRenderingContext2D,
  );
  printer.jobs = [];
  localStorage.clear();
});

const printedHost = () => {
  const host = document.createElement("div");
  host.innerHTML = printer.jobs[printer.jobs.length - 1].html;
  return host;
};

describe("buildLabelHtml", () => {
  it("escapes the product name and falls back to the product id when there is no barcode", () => {
    const host = document.createElement("div");
    host.innerHTML = buildLabelHtml(products[1], "NGN");
    expect(host.querySelector(".name")?.textContent).toBe("Amoxicillin <b>");
    expect(host.querySelector(".name b")).toBeNull();
    expect(host.querySelector(".price")?.textContent).toBe("NGN 900");
    expect(host.querySelector("svg")).toBeTruthy();
  });
});

describe("BarcodeBulkPrintDialog", () => {
  it("prints one label per product on a single A4 sheet", () => {
    localStorage.setItem("label_print_layout", "a4");
    render(<BarcodeBulkPrintDialog isOpen onClose={() => {}} products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /print 3 labels/i }));
    expect(printedHost().querySelectorAll(".sheet")).toHaveLength(1);
    expect(printedHost().querySelectorAll(".label")).toHaveLength(3);
  });

  it("multiplies by the copies per product and shows the paper it needs", () => {
    render(<BarcodeBulkPrintDialog isOpen onClose={() => {}} products={products} />);
    fireEvent.change(screen.getByLabelText("Labels per product"), { target: { value: "2" } });
    expect(screen.getByRole("button", { name: /print 6 labels/i })).toBeTruthy();
    expect(screen.getByText("6 labels on 6 roll labels")).toBeTruthy();
  });

  it("warns about products without a barcode", () => {
    render(<BarcodeBulkPrintDialog isOpen onClose={() => {}} products={products} />);
    expect(screen.getByText(/1 product has no barcode or one that cannot be printed; its label prints the product id/)).toBeTruthy();
  });

  it("counts a barcode the encoder rejects with the missing ones and prints its product id", () => {
    const accented = { id: "p4", name: "Café Syrup", barcode: "café123", unit_price: 500 };
    render(<BarcodeBulkPrintDialog isOpen onClose={() => {}} products={[...products, accented]} />);
    expect(screen.getByText(/2 products have no barcode or one that cannot be printed; their label prints the product id/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /print 4 labels/i }));
    const label = Array.from(printedHost().querySelectorAll(".label")).find((l) => l.querySelector(".name")?.textContent === "Café Syrup");
    expect(label?.querySelectorAll("svg rect").length).toBeGreaterThan(1);
    expect(label?.querySelector("svg text")?.textContent).toBe("p4");
  });

  it("blocks a job over the per-job limit", () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, barcode: "123", unit_price: 1 }));
    render(<BarcodeBulkPrintDialog isOpen onClose={() => {}} products={many} />);
    fireEvent.change(screen.getByLabelText("Labels per product"), { target: { value: "50" } });
    expect(screen.getByRole("alert").textContent).toMatch(/most one job can print is 2000/);
    expect(screen.getByRole("button", { name: /print 2050 labels/i }).hasAttribute("disabled")).toBe(true);
  });
});
