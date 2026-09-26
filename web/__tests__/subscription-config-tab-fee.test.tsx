import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionConfigTab } from "@/components/admin/views/subscription-config-tab";
import {
  DEFAULT_SUBSCRIPTION_CONFIG,
  DEFAULT_SOCIAL_LINKS,
} from "@/lib/constants/subscription-config-defaults";

const { mockMutateAsync } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(async () => undefined),
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

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      key: "storefront_platform_fee_percentage",
      value: 3.5,
    }));
  });
});
