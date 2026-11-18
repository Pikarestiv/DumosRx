import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { WEB_APP_URL } from "@/lib/constants";

let mockStatsData: { referral_code?: string; referral_credits?: number; referrals?: unknown[] } | null = null;
let mockIsLoading = false;
let mockIsError = false;

vi.mock("@/lib/hooks/use-billing", () => ({
  useReferralStats: () => ({
    data: mockStatsData,
    isLoading: mockIsLoading,
    isError: mockIsError,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { ReferralTab } from "@/components/settings/billing/referral-tab";

describe("A-372: Customer referral link target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatsData = null;
    mockIsLoading = false;
    mockIsError = false;

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  it("builds the referral link pointing to WEB_APP_URL/register instead of window.location.origin", () => {
    mockStatsData = {
      referral_code: "STORE-REF-101",
      referral_credits: 5000,
      referrals: [],
    };

    render(<ReferralTab />);

    const input = screen.getByPlaceholderText(/loading your referral link/i) as HTMLInputElement;
    expect(input.value).toBe(`${WEB_APP_URL}/register?ref=STORE-REF-101`);
    expect(input.value).not.toContain("window.location.origin");
    expect(input.value).toMatch(/^https:\/\/dumosrx\.com\/register\?ref=STORE-REF-101/);
  });

  it("leaves the referral link empty when referral_code is not present", () => {
    mockStatsData = {
      referral_credits: 0,
      referrals: [],
    };

    render(<ReferralTab />);

    const input = screen.getByPlaceholderText(/loading your referral link/i) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("copies the WEB_APP_URL referral link to clipboard on click", async () => {
    mockStatsData = {
      referral_code: "STORE-REF-202",
      referral_credits: 0,
      referrals: [],
    };

    render(<ReferralTab />);

    const copyButton = screen.getByRole("button", { name: "" });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${WEB_APP_URL}/register?ref=STORE-REF-202`
    );
  });
});
