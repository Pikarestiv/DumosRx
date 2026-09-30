import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionConfigTab } from "@/components/admin/views/subscription-config-tab";
import { PlanTierCard } from "@/components/admin/views/plan-tier-card";
import { ReferralsSettingsForm } from "@/components/admin/marketing/referrals-settings-form";
import {
  DEFAULT_SUBSCRIPTION_CONFIG,
  DEFAULT_SOCIAL_LINKS,
} from "@/lib/constants/subscription-config-defaults";
import type { ReferralProgramSettings } from "@/components/admin/marketing/types";

const { mockMutateAsync } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/hooks")>("@/lib/api/hooks");
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
    useUpdateSystemConfigMutation: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("platform config numeric fields reject an emptied box", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the saved trial length when the field is cleared", async () => {
    render(<SubscriptionConfigTab />, { wrapper });
    const user = userEvent.setup();

    const trialInput = screen.getByLabelText(/free trial duration/i);
    expect(trialInput).toHaveValue(DEFAULT_SUBSCRIPTION_CONFIG.trial_days);

    await user.clear(trialInput);
    expect(screen.getByText(/stays saved/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const payload = mockMutateAsync.mock.calls.at(0)?.at(0) as unknown as {
      key: string;
      value: { trial_days: number };
    };
    expect(payload.key).toBe("subscription_plans");
    expect(payload.value.trial_days).toBe(DEFAULT_SUBSCRIPTION_CONFIG.trial_days);
  });

  it("keeps the saved storefront commission when the field is cleared", async () => {
    render(<SubscriptionConfigTab />, { wrapper });
    const user = userEvent.setup();

    const feeInput = screen.getByLabelText(/storefront commission/i);
    await user.clear(feeInput);
    await user.click(
      screen.getByRole("button", { name: /save storefront commission/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /update commission/i }),
    );

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        key: "storefront_platform_fee_percentage",
        value: 2,
      }),
    );
  });

  it("never commits a zero staff or store limit from a cleared plan limit", async () => {
    const setConfig = vi.fn();
    render(
      <PlanTierCard
        tierKey="starter"
        title="Starter Plan"
        config={DEFAULT_SUBSCRIPTION_CONFIG}
        setConfig={setConfig}
      />,
    );
    const user = userEvent.setup();

    const staffInput = screen.getByLabelText(/max staff/i);
    await user.clear(staffInput);
    expect(screen.getByText(/stays saved/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/max stores/i));
    expect(setConfig).not.toHaveBeenCalled();

    // Blurring a rejected draft restores the saved value, so retype from it.
    await user.clear(staffInput);
    await user.type(staffInput, "5");
    expect(setConfig).toHaveBeenCalled();
    const next = setConfig.mock.calls.at(-1)?.[0] as typeof DEFAULT_SUBSCRIPTION_CONFIG;
    expect(next.tiers.starter.limits.staff).toBe(5);
  });

  it("never commits a zero referral reward from a cleared field", async () => {
    const settings: ReferralProgramSettings = {
      enabled: true,
      reward_percentage: 10,
      reward_trigger: "first",
      allow_full_credit_payment: false,
    };
    const onChange = vi.fn();
    render(
      <ReferralsSettingsForm
        settings={settings}
        onChange={onChange}
        onSave={vi.fn()}
        saving={false}
      />,
    );
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/reward percentage/i));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/stays saved/i)).toBeInTheDocument();
  });
});
