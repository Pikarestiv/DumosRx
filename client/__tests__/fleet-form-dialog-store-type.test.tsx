import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { updateStore } = vi.hoisted(() => ({ updateStore: vi.fn(() => Promise.resolve({})) }));

vi.mock("@/lib/api/client", () => ({ apiClient: { updateStore, createStore: vi.fn() } }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ refetch: vi.fn() }) }));

import { FleetFormDialog } from "@/components/settings/store/fleet-form-dialog";

const RETAIL_STORE = { id: "s2", name: "Old Branch", location: "", address: "", phone: "", store_type: "retail" };

describe("fleet dialog with a legacy retail store", () => {
  it("shows the store as General Store but saves retail back untouched", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <FleetFormDialog isOpen onOpenChange={() => {}} storeToEdit={RETAIL_STORE} activeStoreId={null} onSuccess={() => {}} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Store Type" }).textContent).toBe("General Store");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore).toHaveBeenCalledWith("s2", expect.objectContaining({ store_type: "retail" }));
  });
});
