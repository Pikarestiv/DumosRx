import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManagerCard } from "@/components/admin/stores/details/account-manager-card";
import { DefaultAccountManagerCard } from "@/components/admin/views/default-account-manager-card";
import type { AdminStoreDetail } from "@/lib/types/admin";
import { toast } from "sonner";

const mockCandidates = [
  { id: "usr-1", name: "Ada Lovelace", role: "platform_staff", email: "ada@example.com", phone: "123" },
  { id: "usr-2", name: "Charles Babbage", role: "admin", email: "charles@example.com", phone: null },
];

const { mutateMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api/admin-hooks-stores", () => ({
  useAccountManagerCandidates: () => ({
    data: { data: mockCandidates },
    isLoading: false,
  }),
  useUpdateAccountManagerMutation: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
}));

const mockGetSystemConfig = vi.fn();
const mockUpdateSystemConfig = vi.fn();

vi.mock("@/lib/api/client", () => ({
  webApiClient: {
    getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
    updateSystemConfig: (...args: unknown[]) => mockUpdateSystemConfig(...args),
  },
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const baseStore = {
  id: "store-1",
  name: "Nest Agidi",
  account_manager: null,
  account_manager_is_explicit: false,
} as unknown as AdminStoreDetail;

describe("AccountManagerCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders card title as 'Account Manager' without referencing 'Contact Specialist'", () => {
    renderWithQueryClient(<AccountManagerCard store={baseStore} />);

    expect(screen.getByRole("heading", { name: "Account Manager" })).toBeInTheDocument();
    expect(screen.queryByText(/Contact Specialist/i)).not.toBeInTheDocument();
  });

  it("describes unassigned state using 'account manager'", () => {
    renderWithQueryClient(<AccountManagerCard store={baseStore} />);

    expect(screen.getByText("No account manager resolved.")).toBeInTheDocument();
    expect(screen.queryByText(/contact specialist/i)).not.toBeInTheDocument();
  });

  it("triggers updateAccountManager mutation and fires success toast on save", async () => {
    mutateMock.mockImplementation((_vars, { onSuccess }) => {
      onSuccess?.();
    });

    renderWithQueryClient(
      <AccountManagerCard
        store={{
          ...baseStore,
          account_manager: { id: "usr-1", name: "Ada Lovelace", email: "ada@example.com" },
          account_manager_is_explicit: true,
        }}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /save assignment/i });
    await userEvent.click(saveBtn);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "store-1", accountManagerId: "usr-1" }),
      expect.any(Object),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Account manager updated",
      expect.objectContaining({ description: "Nest Agidi's account manager was reassigned." }),
    );
  });
});

describe("DefaultAccountManagerCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemConfig.mockResolvedValue("usr-1");
  });

  it("renders heading as 'Default Account Manager' without referencing 'Contact Specialist'", async () => {
    renderWithQueryClient(<DefaultAccountManagerCard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Default Account Manager" })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Default Contact Specialist/i)).not.toBeInTheDocument();
  });

  it("saves default account manager and emits toast without 'contact specialist'", async () => {
    mockUpdateSystemConfig.mockResolvedValue({ ok: true });

    renderWithQueryClient(<DefaultAccountManagerCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save default/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /save default/i }));

    await waitFor(() => {
      expect(mockUpdateSystemConfig).toHaveBeenCalledWith("default_account_manager_id", "usr-1");
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Default account manager updated",
      expect.any(Object),
    );
    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringMatching(/contact specialist/i),
      expect.any(Object),
    );
  });
});
