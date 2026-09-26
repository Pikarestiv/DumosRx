import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnlinePaymentsSection } from "@/components/settings/store/online-payments-section";

// jsdom doesn't implement ResizeObserver or the pointer-capture APIs Radix's
// Select uses under the hood - same workaround as
// pin-entry-lockout-ui.test.tsx uses for input-otp's ResizeObserver need.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getPaymentBanks: vi.fn(async () => ({ banks: [{ name: "GTBank", code: "058" }] })),
    resolvePaymentAccount: vi.fn(async () => ({ account_name: "JANE M DOE" })),
    createPaymentAccount: vi.fn(async () => ({ message: "Payment account connected." })),
  },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true, pushed: 0, pulled: 0 })),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function pickOption(triggerName: RegExp, optionName: RegExp) {
  fireEvent.click(await screen.findByRole("combobox", { name: triggerName }));
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("OnlinePaymentsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the account name before allowing the owner to confirm and connect", async () => {
    render(<OnlinePaymentsSection storeId="store-1" storeName="Jane's Pharmacy" />, { wrapper });

    await pickOption(/country/i, /nigeria/i);
    await pickOption(/bank/i, /gtbank/i);
    fireEvent.change(screen.getByLabelText(/account number/i), { target: { value: "0123456789" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByText(/JANE M DOE/)).toBeTruthy();

    const connectButton = screen.getByRole("button", { name: /connect/i }) as HTMLButtonElement;
    expect(connectButton.disabled).toBe(false);
    fireEvent.click(connectButton);

    const { apiClient } = await import("@/lib/api/client");
    await waitFor(() =>
      expect(apiClient.createPaymentAccount).toHaveBeenCalledWith("store-1", {
        account_number: "0123456789",
        bank_code: "058",
        country: "nigeria",
        confirmed_unverifiable: false,
      }),
    );

    const { sync } = await import("@/lib/db/sync-engine");
    await waitFor(() => expect(sync).toHaveBeenCalledWith(true));
  });

  it("shows an unverified notice and requires an extra confirmation when resolution returns no name", async () => {
    const { apiClient } = await import("@/lib/api/client");
    vi.mocked(apiClient.getPaymentBanks).mockResolvedValueOnce({ banks: [] });
    vi.mocked(apiClient.resolvePaymentAccount).mockResolvedValueOnce({ account_name: null });

    render(<OnlinePaymentsSection storeId="store-1" storeName="Jane's Pharmacy" />, { wrapper });

    await pickOption(/country/i, /rwanda/i);
    fireEvent.change(await screen.findByLabelText(/bank name/i), { target: { value: "Bank of Kigali" } });
    fireEvent.change(screen.getByLabelText(/account number/i), { target: { value: "9999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByText(/can.t verify this automatically/i)).toBeTruthy();

    const connectButton = screen.getByRole("button", { name: /connect/i }) as HTMLButtonElement;
    expect(connectButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /double.checked/i }));
    expect(connectButton.disabled).toBe(false);

    fireEvent.click(connectButton);

    await waitFor(() =>
      expect(apiClient.createPaymentAccount).toHaveBeenCalledWith("store-1", {
        account_number: "9999999999",
        bank_code: "Bank of Kigali",
        country: "rwanda",
        confirmed_unverifiable: true,
      }),
    );
  });
});
