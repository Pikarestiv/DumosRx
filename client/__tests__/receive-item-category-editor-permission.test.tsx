import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const hasPermission = vi.fn((_key: string) => true);
const quickEdit = vi.fn(() => Promise.resolve(undefined));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/hooks/use-product-quick-edit-mutation", () => ({
  useQuickEditProductMutation: () => ({
    mutateAsync: quickEdit,
    isPending: false,
  }),
}));
vi.mock("@/lib/db/queries/categories", () => ({
  getCategoryList: vi.fn(() => Promise.resolve([
    { id: "c1", name: "Cement", productCount: 2 },
  ])),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

import { ReceiveItemCategoryEditor } from "@/components/procurement/receive-item-category-editor";

// Product names now render through ProductName, which reads the store's
// casing setting; these specs mount their component without a provider.
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 1 } }),
}));

function renderEditor() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReceiveItemCategoryEditor
        productId="p1"
        productName="Portland Cement"
        categoryName="Cement"
      />
    </QueryClientProvider>,
  );
}

// Item 5: a delivery is when a wrongly-filed product gets noticed, but the receive ledger has no room for a category colum…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-receive-item-category-editor-permission-test-tsx-L59
describe("ReceiveItemCategoryEditor", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    quickEdit.mockReset();
    hasPermission.mockReturnValue(true);
  });

  it("renders the edit affordance for a user with manage_products", () => {
    renderEditor();
    expect(
      screen.getByLabelText("Edit category for Portland Cement"),
    ).toBeTruthy();
  });

  it("renders nothing for a user without manage_products", () => {
    hasPermission.mockReturnValue(false);
    renderEditor();
    expect(
      screen.queryByLabelText("Edit category for Portland Cement"),
    ).toBeNull();
  });

  it("saves a category-only product update", async () => {
    renderEditor();
    fireEvent.click(screen.getByLabelText("Edit category for Portland Cement"));

    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "Roofing Sheets" } });
    fireEvent.click(screen.getByRole("button", { name: /save category/i }));

    await waitFor(() =>
      expect(quickEdit).toHaveBeenCalledWith({
        id: "p1",
        category: "Roofing Sheets",
      }),
    );
  });
});
