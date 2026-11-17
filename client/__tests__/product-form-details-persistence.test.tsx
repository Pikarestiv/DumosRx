import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy", currency: "NGN" } }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseEcommerce: true, getUpgradeMessage: () => "" }),
}));
vi.mock("@/lib/hooks/use-product-list", () => ({ useProductList: () => ({ data: [] }) }));
vi.mock("@/components/ui/category-combobox", () => ({ CategoryCombobox: () => null }));
vi.mock("@/components/pos/camera-scanner-dialog", () => ({ CameraScannerDialog: () => null }));
vi.mock("@/components/products/unit-select", () => ({ UnitSelect: () => null }));

import { ProductFormFields } from "@/components/products/product-form-fields";
import { emptyProductForm } from "@/components/products/add-product-form-state";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const suggestions = { names: [], categories: [], manufacturers: [], suppliers: [], strengths: [] };

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductFormFields
        formData={emptyProductForm()}
        onInputChange={vi.fn()}
        isPharmacy
        suggestions={suggestions}
        t={(key) => key}
      />
    </QueryClientProvider>,
  );
}

const detailsToggle = () => screen.getByRole("button", { name: /additional details/i });
const detailsPanel = () => screen.getByLabelText("Manufacturer").closest("div.grid") as HTMLElement;

describe("product form additional details", () => {
  beforeEach(() => localStorage.clear());

  it("starts collapsed the first time", () => {
    renderForm();
    expect(detailsPanel().className).toContain("max-h-0");
  });

  it("remembers being opened for the next form", () => {
    const first = renderForm();
    fireEvent.click(detailsToggle());
    expect(localStorage.getItem(STORAGE_KEYS.productFormDetailsOpen)).toBe("1");
    first.unmount();

    renderForm();
    expect(detailsPanel().className).toContain("opacity-100");
  });

  it("remembers being closed again", () => {
    localStorage.setItem(STORAGE_KEYS.productFormDetailsOpen, "1");
    const first = renderForm();
    fireEvent.click(detailsToggle());
    first.unmount();

    renderForm();
    expect(detailsPanel().className).toContain("max-h-0");
  });

  it("keeps strength and dosage form inside the additional details", () => {
    renderForm();
    expect(detailsPanel().contains(screen.getByLabelText("Strength / Size"))).toBe(true);
    expect(detailsPanel().contains(screen.getByLabelText("Dosage Form"))).toBe(true);
  });

  it("does not put a field hint ahead of the name field in the tab order", () => {
    const { container } = renderForm();
    const tabbable = Array.from(
      container.querySelectorAll<HTMLElement>("input, button, select, textarea, [tabindex]"),
    ).filter((el) => el.getAttribute("tabindex") !== "-1");
    expect(tabbable[0].getAttribute("role")).toBe("combobox");
  });
});
