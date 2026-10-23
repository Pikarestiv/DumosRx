import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ canSee: true, toastErrors: [] as string[] }));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => key === "view_stock_quantities" && state.canSee,
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    availableStores: [
      { id: "s1", name: "Main" },
      { id: "s2", name: "Branch" },
    ],
    activeStoreId: "s1",
  }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "sales_staff" } }),
}));

vi.mock("@/lib/db/queries/stock-transfers", () => ({
  getTransferableProducts: () =>
    Promise.resolve([{ id: "p1", name: "Amoxil", available_quantity: 7, base_unit: "tab" }]),
  transferStock: () => Promise.reject(new Error("Insufficient stock: only 7 unit(s) available, requested 6")),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (m: string) => state.toastErrors.push(m) },
}));

vi.mock("@/components/ui/responsive-modal", () => ({
  ResponsiveModal: ({ open, children, footer }: { open: boolean; children: React.ReactNode; footer: React.ReactNode }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label="From store" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import { TransferStockDialog } from "@/components/stock-batch/transfer-stock-dialog";

async function openWithProduct(canSee: boolean) {
  state.canSee = canSee;
  const view = render(<TransferStockDialog open onOpenChange={() => {}} onTransferred={() => {}} />);
  fireEvent.change(screen.getByLabelText("From store"), { target: { value: "s2" } });
  const combobox = (await screen.findAllByRole("combobox")).find((el) => el.tagName === "INPUT") as HTMLInputElement;
  await waitFor(() => expect((combobox as HTMLInputElement).disabled).toBe(false));
  fireEvent.focus(combobox);
  const option = await screen.findByRole("option", { name: /Amoxil/ });
  return { view, option };
}

function chooseAndType(option: HTMLElement, quantity: string) {
  fireEvent.click(option);
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: quantity } });
}

describe("Transfer stock dialog and view_stock_quantities", () => {
  beforeEach(() => {
    state.toastErrors.length = 0;
  });

  it("shows the source store's quantity with the permission", async () => {
    const { option } = await openWithProduct(true);
    expect(option.textContent).toContain("7 tab");

    chooseAndType(option, "9");

    expect(screen.getByText(/tab\(s\) available/).textContent).toContain("7");
    expect(screen.getByText(/Only 7 available/)).toBeTruthy();
  });

  it("names no quantity without the permission", async () => {
    const { view, option } = await openWithProduct(false);
    expect(option.textContent).toContain("Available");
    expect(option.textContent).not.toMatch(/\d/);

    chooseAndType(option, "3");
    expect(screen.getByText("Available", { selector: "p" })).toBeTruthy();

    chooseAndType(option, "9");
    expect(screen.getByText("Not enough for that quantity")).toBeTruthy();
    expect(view.container.textContent).not.toContain("7");
  });

  it("rewords the insufficient-stock error without the permission", async () => {
    const { option } = await openWithProduct(false);
    chooseAndType(option, "6");

    fireEvent.click(screen.getByText("Transfer Stock"));

    await waitFor(() => expect(state.toastErrors).toEqual(["Not enough stock in that store for that quantity"]));
  });

  it("keeps the insufficient-stock error as-is with the permission", async () => {
    const { option } = await openWithProduct(true);
    chooseAndType(option, "6");

    fireEvent.click(screen.getByText("Transfer Stock"));

    await waitFor(() => expect(state.toastErrors[0]).toContain("only 7 unit(s) available"));
  });
});
