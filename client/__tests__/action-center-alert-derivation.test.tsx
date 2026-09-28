import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

type LicenseStatus = {
  isValid: boolean;
  tier: string;
  isTrial: boolean;
  expiryDate?: string | null;
};

const state = {
  isAuthenticated: true,
  isAdmin: true,
  role: "store_owner",
  storeProfile: null as Record<string, unknown> | null,
  staffCount: 3,
  syncQueueCount: 0,
  license: null as LicenseStatus | null,
  showWidgetPrompt: false,
  isTauri: true,
  isStandalonePwa: false,
};

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    isAuthenticated: state.isAuthenticated,
    isAdmin: state.isAdmin,
    user: { role: state.role },
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: state.storeProfile }),
}));

vi.mock("@/lib/db/queries/auth", () => ({
  getStaffCount: vi.fn(async () => state.staffCount),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(async () => state.syncQueueCount),
}));

vi.mock("@/lib/licensing/licensing-manager", () => ({
  checkLicenseStatus: vi.fn(async () => state.license),
}));

vi.mock("@/lib/db/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/core")>()),
  isTauri: () => state.isTauri,
}));

vi.mock("@/lib/utils/platform", () => ({
  isStandalonePwa: () => state.isStandalonePwa,
}));

const promptPinWidget = vi.fn();
vi.mock("@/lib/hooks/use-widget-pin-prompt", () => ({
  useWidgetPinPrompt: () => ({
    showWidgetPrompt: state.showWidgetPrompt,
    promptPinWidget,
  }),
}));

import { useActionCenterAlerts } from "@/lib/hooks/use-action-center-alerts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * useActionCenterAlerts decides what the dashboard tells an owner to act on
 * and in what order. It had 0% coverage, so nothing checked that a
 * non-admin is shown nothing, that the licence day-count and its <7-day
 * threshold are right, that the profile-completeness percentage counts the
 * pharmacy-only PCN field, or that alerts come back sorted by priority.
 */
describe("useActionCenterAlerts", () => {
  beforeEach(() => {
    Object.assign(state, {
      isAuthenticated: true,
      isAdmin: true,
      role: "store_owner",
      storeProfile: {
        name: "Pharma",
        address: "1 Road",
        phone: "080",
        email: "a@b.c",
        logo_url: "/l.png",
        store_type: "supermarket",
      },
      staffCount: 3,
      syncQueueCount: 0,
      license: null,
      showWidgetPrompt: false,
      isTauri: true,
      isStandalonePwa: false,
    });
    promptPinWidget.mockClear();
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  async function alerts(
    counts: { expiring?: number; lowStock?: number; missingExpiry?: number; oversold?: number } = {},
  ) {
    const { result } = renderHook(
      () =>
        useActionCenterAlerts(
          counts.expiring ?? 0,
          counts.lowStock ?? 0,
          counts.missingExpiry ?? 0,
          counts.oversold ?? 0,
        ),
      { wrapper },
    );
    // the staff/sync/licence queries all resolve asynchronously
    await waitFor(() => expect(result.current).toBeDefined());
    await waitFor(() => {
      expect(result.current.some((a) => a.id === "no-staff")).toBe(
        state.staffCount === 0,
      );
    });
    return result;
  }

  const ids = (list: { id: string }[]) => list.map((a) => a.id);

  it("shows a non-admin nothing at all, however bad the inventory looks", async () => {
    state.isAdmin = false;
    const result = await alerts({ expiring: 9, lowStock: 9, oversold: 9, missingExpiry: 9 });
    expect(result.current).toEqual([]);
  });

  it("raises a critical cloud-sync alert only when no cloud account is linked", async () => {
    state.isAuthenticated = false;
    let result = await alerts();
    expect(ids(result.current)).toContain("cloud-sync");
    expect(result.current.find((a) => a.id === "cloud-sync")?.priority).toBe("critical");

    state.isAuthenticated = true;
    result = await alerts();
    expect(ids(result.current)).not.toContain("cloud-sync");
  });

  it("raises a critical no-staff alert when the store has no staff PINs", async () => {
    state.staffCount = 0;
    const result = await alerts();
    const alert = result.current.find((a) => a.id === "no-staff");
    expect(alert?.priority).toBe("critical");
    expect(alert?.actionRoute).toBe("/settings/staff");
  });

  it("reports the store profile's completion percentage when fields are missing", async () => {
    state.storeProfile = {
      name: "Pharma",
      address: "1 Road",
      phone: "080",
      email: null,
      logo_url: null,
      store_type: "supermarket",
    };
    const result = await alerts();
    // 3 of 5 non-pharmacy fields filled
    expect(result.current.find((a) => a.id === "profile-incomplete")?.title).toBe(
      "Profile 60% Complete",
    );
  });

  it("counts the pharmacy-only PCN licence field against a pharmacy's completion", async () => {
    state.storeProfile = {
      name: "Pharma",
      address: "1 Road",
      phone: "080",
      email: "a@b.c",
      logo_url: "/l.png",
      store_type: "pharmacy",
    };
    const result = await alerts();
    // all 5 shared fields filled, but pcn_license is missing: 5 of 6
    expect(result.current.find((a) => a.id === "profile-incomplete")?.title).toBe(
      "Profile 83% Complete",
    );
  });

  it("raises no profile alert once every field a supermarket needs is filled", async () => {
    const result = await alerts();
    expect(ids(result.current)).not.toContain("profile-incomplete");
    expect(ids(result.current)).not.toContain("profile-missing");
  });

  it("raises a critical setup alert when there is no store profile at all", async () => {
    state.storeProfile = null;
    const result = await alerts();
    const alert = result.current.find((a) => a.id === "profile-missing");
    expect(alert?.priority).toBe("critical");
  });

  it("raises a critical expired-subscription alert for an invalid paid licence", async () => {
    state.license = { isValid: false, tier: "pro", isTrial: false, expiryDate: null };
    const result = await alerts();
    await waitFor(() =>
      expect(ids(result.current)).toContain("subscription-expired"),
    );
    expect(
      result.current.find((a) => a.id === "subscription-expired")?.priority,
    ).toBe("critical");
  });

  it("stays quiet about the subscription for a plain free, non-trial licence", async () => {
    state.license = { isValid: false, tier: "free", isTrial: false, expiryDate: null };
    const result = await alerts();
    expect(ids(result.current)).not.toContain("subscription-expired");
    expect(ids(result.current)).not.toContain("subscription-expiring");
  });

  it("counts the days left on an expiring paid licence", async () => {
    state.license = {
      isValid: true,
      tier: "pro",
      isTrial: false,
      expiryDate: new Date(Date.now() + 3 * DAY + 60_000).toISOString(),
    };
    const result = await alerts();
    await waitFor(() =>
      expect(ids(result.current)).toContain("subscription-expiring"),
    );
    expect(result.current.find((a) => a.id === "subscription-expiring")?.title).toBe(
      "Expiring (3 Days Left)",
    );
  });

  it("stays quiet about a paid licence still more than a week from expiry", async () => {
    state.license = {
      isValid: true,
      tier: "pro",
      isTrial: false,
      expiryDate: new Date(Date.now() + 8 * DAY).toISOString(),
    };
    const result = await alerts();
    expect(ids(result.current)).not.toContain("subscription-expiring");
  });

  it("warns about a trial however many days are left on it", async () => {
    state.license = {
      isValid: true,
      tier: "pro",
      isTrial: true,
      expiryDate: new Date(Date.now() + 20 * DAY + 60_000).toISOString(),
    };
    const result = await alerts();
    await waitFor(() =>
      expect(ids(result.current)).toContain("subscription-expiring"),
    );
    expect(result.current.find((a) => a.id === "subscription-expiring")?.title).toBe(
      "Trial (20 Days Left)",
    );
  });

  it("pluralizes the inventory counts and marks oversold stock critical", async () => {
    const result = await alerts({
      expiring: 1,
      lowStock: 2,
      missingExpiry: 1,
      oversold: 3,
    });
    const byId = Object.fromEntries(result.current.map((a) => [a.id, a]));
    expect(byId["expiring-soon"].title).toBe("1 Item Expiring");
    expect(byId["low-stock"].title).toBe("2 Items Low Stock");
    expect(byId["missing-expiry"].title).toBe("1 Batch Missing Expiry");
    expect(byId["oversold"].title).toBe("3 Items Oversold");
    expect(byId["oversold"].priority).toBe("critical");
    expect(byId["low-stock"].priority).toBe("warning");
  });

  it("raises no inventory alerts when every count is zero", async () => {
    const result = await alerts();
    expect(ids(result.current)).not.toContain("expiring-soon");
    expect(ids(result.current)).not.toContain("low-stock");
    expect(ids(result.current)).not.toContain("oversold");
    expect(ids(result.current)).not.toContain("missing-expiry");
  });

  it("offers the widget prompt as a handler rather than a route", async () => {
    state.showWidgetPrompt = true;
    const result = await alerts();
    const alert = result.current.find((a) => a.id === "add-widget");
    expect(alert?.actionRoute).toBeUndefined();
    alert?.onAction?.();
    expect(promptPinWidget).toHaveBeenCalled();
  });

  it("withholds the widget prompt from a session with no cloud account", async () => {
    state.showWidgetPrompt = true;
    state.isAuthenticated = false;
    const result = await alerts();
    expect(ids(result.current)).not.toContain("add-widget");
  });

  it("pitches the app only to a store owner on a plain browser tab", async () => {
    state.isTauri = false;
    let result = await alerts();
    expect(ids(result.current)).toContain("get-the-app");

    state.isStandalonePwa = true;
    result = await alerts();
    expect(ids(result.current)).not.toContain("get-the-app");

    state.isStandalonePwa = false;
    state.role = "pharmacist";
    result = await alerts();
    expect(ids(result.current)).not.toContain("get-the-app");
  });

  it("warns about unsynced changes with the pending count", async () => {
    state.syncQueueCount = 4;
    const result = await alerts();
    await waitFor(() => expect(ids(result.current)).toContain("pending-sync"));
    expect(result.current.find((a) => a.id === "pending-sync")?.title).toBe(
      "4 Changes Unsynced",
    );
  });

  it("sorts alerts critical first, then warning, then info", async () => {
    state.storeProfile = {
      name: "Pharma",
      address: null,
      phone: null,
      email: null,
      logo_url: null,
      store_type: "supermarket",
    };
    const result = await alerts({ lowStock: 2, oversold: 1 });
    const priorities = result.current.map((a) => a.priority);
    const weight = { critical: 3, warning: 2, info: 1, success: 0 } as const;
    expect(priorities.length).toBeGreaterThan(2);
    for (let i = 1; i < priorities.length; i++) {
      expect(weight[priorities[i - 1]]).toBeGreaterThanOrEqual(weight[priorities[i]]);
    }
    expect(priorities[0]).toBe("critical");
    expect(priorities[priorities.length - 1]).toBe("info");
  });
});
