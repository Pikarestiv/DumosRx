import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getCategoryList = vi.fn();

vi.mock("@/lib/db/queries/categories", () => ({
  getCategoryList: () => getCategoryList(),
}));

import { CategoryCombobox } from "@/components/ui/category-combobox";

function renderCombobox(value = "") {
  const onValueChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CategoryCombobox value={value} onValueChange={onValueChange} />
    </QueryClientProvider>,
  );
  return { onValueChange };
}

async function openMenu() {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  await screen.findByRole("listbox");
  return input;
}

/**
 * Item 4: the Add Product category dropdown used to read from the static
 * FORM_SUGGESTIONS list and never from the real `categories` table, so a
 * construction-materials store was offered pharmacy categories only.
 */
describe("CategoryCombobox source", () => {
  beforeEach(() => {
    getCategoryList.mockReset();
  });

  it("lists the store's real categories", async () => {
    getCategoryList.mockResolvedValue([
      { id: "1", name: "Cement", productCount: 3 },
      { id: "2", name: "Roofing Sheets", productCount: 1 },
    ]);
    renderCombobox();
    await openMenu();

    expect(await screen.findByText("Cement")).toBeTruthy();
    expect(screen.getByText("Roofing Sheets")).toBeTruthy();
  });

  it("never substitutes the static FORM_SUGGESTIONS list when the table is empty", async () => {
    getCategoryList.mockResolvedValue([]);
    renderCombobox();
    await openMenu();

    expect(
      await screen.findByText(/No categories yet/i),
    ).toBeTruthy();
    expect(screen.queryByText("Analgesics")).toBeNull();
    expect(screen.queryByText("Pain Relief")).toBeNull();
  });

  it("offers an explicit create row for a name that does not exist yet", async () => {
    getCategoryList.mockResolvedValue([{ id: "1", name: "Cement", productCount: 0 }]);
    const { onValueChange } = renderCombobox("Gravel");
    await openMenu();

    const createRow = await screen.findByText('Create "Gravel"');
    fireEvent.click(createRow);
    expect(onValueChange).toHaveBeenCalledWith("Gravel");
  });

  it("does not offer a create row for a category that already exists", async () => {
    getCategoryList.mockResolvedValue([{ id: "1", name: "Cement", productCount: 0 }]);
    renderCombobox("Cement");
    await openMenu();

    await screen.findByRole("listbox");
    expect(screen.queryByText('Create "Cement"')).toBeNull();
  });

  it("bounds the option list to its own scroll area", async () => {
    getCategoryList.mockResolvedValue([{ id: "1", name: "Cement", productCount: 0 }]);
    renderCombobox();
    await openMenu();

    const listbox = await screen.findByRole("listbox");
    expect(listbox.className).toContain("max-h-60");
    expect(listbox.className).toContain("overflow-y-auto");
  });
});
