import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BarcodePrintDialog, type BarcodeLabelProduct } from "@/components/stock-batch/barcode-print-dialog";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const store = vi.hoisted(() => ({ profile: { uppercase_display_enabled: 1 as number, currency: "NGN" } }));
const printer = vi.hoisted(() => ({ jobs: [] as { html: string; pageStyle: string }[] }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: store.profile }),
}));
vi.mock("react-barcode", () => ({
  default: ({ value }: { value: string }) => <svg data-barcode={value} />,
}));
vi.mock("@/lib/utils/print-node", () => ({
  printNode: (node: HTMLElement, pageStyle: string) => {
    printer.jobs.push({ html: node.innerHTML, pageStyle });
    return Promise.resolve();
  },
}));

const EAN_PRODUCT: BarcodeLabelProduct = {
  id: "prd-1",
  name: "paracetamol extra strength caplets",
  barcode: "5901234123457",
  unit_price: 1250,
};
const NO_BARCODE_PRODUCT: BarcodeLabelProduct = {
  id: "3f2b8c1e-9d4a-4e7b-a1c2-5d6e7f8a9b0c",
  name: "amoxicillin",
  unit_price: 900,
};

function renderDialog(product: BarcodeLabelProduct = EAN_PRODUCT) {
  render(<BarcodePrintDialog isOpen onClose={() => {}} product={product} />);
  return screen.getByRole("dialog");
}

const classesOf = (el: Element | null) => Array.from(el?.classList ?? []);
const lastJob = () => printer.jobs[printer.jobs.length - 1];
const printedLabelCount = () => {
  const host = document.createElement("div");
  host.innerHTML = lastJob().html;
  return host.querySelectorAll(".label").length;
};

beforeEach(() => {
  printer.jobs = [];
  store.profile = { uppercase_display_enabled: 1, currency: "NGN" };
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("BarcodePrintDialog layout", () => {
  it("scrolls its body vertically and never sideways, with the actions outside the scroll area", () => {
    const dialog = renderDialog();
    const body = dialog.querySelector("[data-label-dialog-body]");
    expect(body).not.toBeNull();
    expect(classesOf(body)).toEqual(expect.arrayContaining(["overflow-y-auto", "overflow-x-hidden", "min-h-0"]));
    expect(classesOf(dialog)).toEqual(expect.arrayContaining(["flex", "flex-col", "overflow-hidden"]));

    const print = within(dialog).getByRole("button", { name: /^Print 1 label$/ });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(body?.contains(print)).toBe(false);
    expect(body?.contains(cancel)).toBe(false);
  });

  it("wraps a long product name instead of widening the dialog", () => {
    const dialog = renderDialog();
    expect(within(dialog).getByTestId("label-product-name").classList.contains("break-words")).toBe(true);
  });
});

describe("BarcodePrintDialog display caps", () => {
  it("shows and prints the name in capitals when the store displays names in caps", () => {
    const dialog = renderDialog();
    expect(within(dialog).getByTestId("label-product-name").classList.contains("uppercase")).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Print/ }));
    expect(lastJob().pageStyle).toContain("text-transform: uppercase");
  });

  it("shows and prints the name capitalised, like the rest of the app, when caps display is off", () => {
    store.profile = { uppercase_display_enabled: 0, currency: "NGN" };
    const dialog = renderDialog();
    expect(within(dialog).getByTestId("label-product-name").classList.contains("capitalize")).toBe(true);
    expect(within(dialog).getByTestId("label-product-name").classList.contains("uppercase")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Print/ }));
    expect(lastJob().pageStyle).toContain("text-transform: capitalize");
  });
});

describe("BarcodePrintDialog quantity", () => {
  it("prints the number of labels typed in", () => {
    const dialog = renderDialog();
    fireEvent.change(within(dialog).getByLabelText("Number of labels"), { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Print 12 labels" }));
    expect(printedLabelCount()).toBe(12);
  });

  it("clamps a typed quantity to the allowed range when the field is left", () => {
    const dialog = renderDialog();
    const input = within(dialog).getByLabelText("Number of labels");
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("500");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("1");
  });

  it("offers presets that set the quantity in one tap", () => {
    const dialog = renderDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "24 labels" }));
    expect((within(dialog).getByLabelText("Number of labels") as HTMLInputElement).value).toBe("24");
    expect(within(dialog).getByText("24 labels on 24 roll labels")).toBeTruthy();
  });
});

describe("BarcodePrintDialog paper layout", () => {
  it("prints one label per roll page by default", () => {
    const dialog = renderDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Print/ }));
    expect(lastJob().pageStyle).toContain("size: 50mm 25mm");
    expect(lastJob().html).not.toContain('class="sheet"');
  });

  it("packs labels onto A4 sheets, skipping used cells, and remembers the choice", () => {
    const dialog = renderDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: /A4 sheet/ }));
    fireEvent.change(within(dialog).getByLabelText("Number of labels"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Start at position"), { target: { value: "23" } });
    expect(within(dialog).getByText("3 labels on 2 A4 sheets")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Print 3 labels" }));
    expect(lastJob().pageStyle).toContain("size: A4");
    const host = document.createElement("div");
    host.innerHTML = lastJob().html;
    expect(host.querySelectorAll(".sheet")).toHaveLength(2);
    expect(host.querySelectorAll(".sheet")[0].querySelectorAll(".blank")).toHaveLength(22);
    expect(localStorage.getItem(STORAGE_KEYS.labelPrintLayout)).toBe("a4");
  });

  it("opens on the layout this device used last", () => {
    localStorage.setItem(STORAGE_KEYS.labelPrintLayout, "a4");
    const dialog = renderDialog();
    expect(within(dialog).getByRole("button", { name: /A4 sheet/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("BarcodePrintDialog barcode width", () => {
  it("warns that a product without a barcode prints its long internal id, too wide to scan", () => {
    const dialog = renderDialog(NO_BARCODE_PRODUCT);
    expect(within(dialog).getByRole("alert").textContent).toMatch(/no barcode/i);
    expect(within(dialog).getByRole("alert").textContent).toMatch(/may not scan/i);
  });

  it("raises no warning for a barcode that fits the label", () => {
    const dialog = renderDialog();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});
