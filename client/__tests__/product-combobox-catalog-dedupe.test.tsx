import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductCombobox } from "@/components/ui/product-combobox";

if (typeof CSS === "undefined" || !CSS.escape) {
  (global as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
}

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { store_type: "pharmacy", uppercase_display_enabled: 1 },
  }),
}));

vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({
    data: [{ id: "p1", name: "Norvasc", generic_name: "Amlodipine", stock_quantity: 20, reorder_level: 5 }],
  }),
}));

function renderCombobox() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductCombobox value="Norvasc" onChange={vi.fn()} showCreateNewOption={false} />
    </QueryClientProvider>,
  );
}

describe("ProductCombobox suggestions", () => {
  it("does not offer a suggestion for a name already in the catalog", () => {
    renderCombobox();
    fireEvent.focus(screen.getByRole("combobox"));

    expect(screen.getAllByText(/^norvasc$/i)).toHaveLength(1);
    expect(screen.queryByText("Suggested")).toBeNull();
  });
});
