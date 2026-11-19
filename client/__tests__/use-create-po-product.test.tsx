import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { NewProductPayload } from "@/lib/types/product";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/local-database", () => ({
  createProduct: vi.fn(() => Promise.resolve("new-product-id")),
}));

import { useCreatePoProduct } from "@/components/procurement/use-create-po-product";
import { STORAGE_KEYS } from "@/lib/storage-keys";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCreatePoProduct", () => {
  beforeEach(() => localStorage.clear());

  it("lets the Add Product dialog remember the category after a procurement save", async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useCreatePoProduct({ refetchProcurementData: () => Promise.resolve(), onCreated, onClose }),
      { wrapper },
    );
    const rememberCategory = () => localStorage.setItem(STORAGE_KEYS.lastProductCategory, "Perfumes");

    act(() => result.current.handleCreateProduct({ name: "Oud" } as NewProductPayload, false, rememberCategory));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(localStorage.getItem(STORAGE_KEYS.lastProductCategory)).toBe("Perfumes");
    expect(onCreated).toHaveBeenCalledWith("new-product-id");
  });
});
