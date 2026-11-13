import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BarcodePrintDialog } from "@/components/stock-batch/barcode-print-dialog";

const printer = vi.hoisted(() => ({ jobs: [] as { html: string }[] }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0, currency: "NGN" } }),
}));
vi.mock("@/lib/utils/print-node", () => ({
  printNode: (node: HTMLElement) => {
    printer.jobs.push({ html: node.innerHTML });
    return Promise.resolve();
  },
}));

const ACCENTED = { id: "prd-7", name: "café syrup", barcode: "café123", unit_price: 500 };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    { measureText: () => ({ width: 5 }) } as unknown as CanvasRenderingContext2D,
  );
  printer.jobs = [];
  localStorage.clear();
});

describe("BarcodePrintDialog with a barcode the encoder rejects", () => {
  it("says the barcode cannot be encoded instead of quoting an infinite width", () => {
    render(<BarcodePrintDialog isOpen onClose={() => {}} product={ACCENTED} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/contains characters a label can't encode/);
    expect(alert.textContent).toMatch(/prints the product's internal ID/);
    expect(screen.getByRole("dialog").textContent).not.toMatch(/Infinity/);
  });

  it("prints and previews the product id's bars rather than an empty barcode", () => {
    render(<BarcodePrintDialog isOpen onClose={() => {}} product={ACCENTED} />);
    const dialog = screen.getByRole("dialog");
    const preview = within(dialog).getByText("Label preview (50 × 25 mm)").previousElementSibling;
    expect(preview?.querySelectorAll("svg rect").length).toBeGreaterThan(1);

    fireEvent.click(within(dialog).getByRole("button", { name: /^Print 1 label$/ }));
    const host = document.createElement("div");
    host.innerHTML = printer.jobs[0].html;
    const svg = host.querySelector(".label svg");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(1);
    expect(svg?.querySelector("text")?.textContent).toBe("prd-7");
  });
});
