import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionConfigTab } from "@/components/admin/views/subscription-config-tab";
import {
  DEFAULT_SUBSCRIPTION_CONFIG,
  DEFAULT_SOCIAL_LINKS,
} from "@/lib/constants/subscription-config-defaults";

const { mockMutateAsync, mockToastError } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(async () => undefined),
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

vi.mock("@/lib/api/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/hooks")>("@/lib/api/hooks");
  return {
    ...actual,
    useSystemConfig: (key: string) => {
      if (key === "storefront_platform_fee_percentage") {
        return { data: 2, isLoading: false, isError: false, refetch: vi.fn() };
      }
      if (key === "subscription_plans") {
        return {
          data: DEFAULT_SUBSCRIPTION_CONFIG,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      if (key === "social_links") {
        return {
          data: DEFAULT_SOCIAL_LINKS,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return actual.useSystemConfig(key);
    },
    useUpdateSystemConfigMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("SubscriptionConfigTab - storefront fee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the current storefront platform fee and saves a change", async () => {
    render(<SubscriptionConfigTab />, { wrapper });

    const feeInput = await screen.findByLabelText(/storefront commission/i);
    expect(feeInput).toHaveValue(2);

    const user = userEvent.setup();
    await user.clear(feeInput);
    await user.type(feeInput, "3.5");
    await user.click(screen.getByRole("button", { name: /save storefront commission/i }));
    expect(screen.getByText(/2% to 3.5%/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /update commission/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      key: "storefront_platform_fee_percentage",
      value: 3.5,
    }));
  });

  it("surfaces the server's message when the commission save is rejected", async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new Error("The value may not be greater than 50."),
    );
    render(<SubscriptionConfigTab />, { wrapper });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save storefront commission/i }));
    await user.click(screen.getByRole("button", { name: /update commission/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "The value may not be greater than 50.",
      ),
    );
  });
});
