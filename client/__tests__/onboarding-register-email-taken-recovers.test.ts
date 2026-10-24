import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Regression test: if `apiClient.register()` 422s "email already taken" during brand-new account creation, that almost alw…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-onboarding-register-email-taken-recovers-test-ts-L7

const routerPushMock = vi.fn();
const loginMock = vi.fn(() => Promise.resolve(true));
const executeMock = vi.fn(() => Promise.resolve(undefined));
const setActiveStoreIdMock = vi.fn();

const registerMock = vi.fn();
const loginApiMock = vi.fn();
const getStoresMock = vi.fn(() => Promise.resolve([{ id: "store-1", name: "Existing Store" }]));
const setTokenMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams("tab=setup&step=register"),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    login: loginMock,
    linkCloudAccount: vi.fn(),
    isCloudLinked: false,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/db/core", () => ({
  generateId: vi.fn(() => "fake-id"),
  execute: executeMock,
  setActiveStoreId: setActiveStoreIdMock,
  restoreDatabase: vi.fn(() => Promise.resolve(undefined)),
  clearDatabaseForNewStore: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getTotalUserCount: vi.fn(() => Promise.resolve(0)),
  getLocalStores: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(() => Promise.resolve({ success: true })),
  syncSubscriptionStatus: vi.fn(() => Promise.resolve({ success: true, updated: true })),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    register: (...a: unknown[]) => registerMock(...a),
    login: (...a: unknown[]) => loginApiMock(...a),
    getProfile: vi.fn(() => Promise.resolve({})),
    getStores: () => getStoresMock(),
    setToken: (...a: unknown[]) => setTokenMock(...a),
  },
}));

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useOnboarding().handleRegister() when the email is already taken", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/app/setup/use-onboarding").useOnboarding>;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, "navigator", {
      value: { ...window.navigator, onLine: true },
      configurable: true,
    });

    const emailTakenError = new Error("The email has already been taken.") as Error & { status?: number };
    emailTakenError.status = 422;
    registerMock.mockRejectedValue(emailTakenError);
    loginApiMock.mockResolvedValue({
      token: "recovered-token",
      user: { id: "existing-user-id", email: "owner@example.com", name: "Owner", role: "store_owner" },
    });
    getStoresMock.mockResolvedValue([{ id: "store-1", name: "Existing Store" }]);
    loginMock.mockResolvedValue(true);

    const { useOnboarding } = await import("@/app/setup/use-onboarding");

    function Harness() {
      hookResult = useOnboarding();
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(Harness));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("logs in with the same credentials instead of surfacing the raw 422, and completes setup", async () => {
    await act(async () => {
      await hookResult.handleRegister(
        "New",
        "Owner",
        "newowner",
        "1234",
        "My Pharmacy",
        undefined,
        "owner@example.com",
        "correct-password",
      );
    });

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(loginApiMock).toHaveBeenCalledWith("owner@example.com", "correct-password");
    expect(setTokenMock).toHaveBeenCalledWith("recovered-token");
    expect(getStoresMock).toHaveBeenCalled();

    // Never dead-ends on the raw "email already taken" server message.
    expect(toastErrorMock).not.toHaveBeenCalledWith(expect.stringContaining("already been taken"));

    // Falls through to the normal success path: local rows seeded under
    // the cloud account's real user id, local login, dashboard redirect.
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      expect.arrayContaining(["existing-user-id"]),
    );
    expect(loginMock).toHaveBeenCalledWith("newowner", "1234");
    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("still surfaces a genuine credential failure instead of looping", async () => {
    const badCredentials = new Error("Invalid credentials") as Error & { status?: number };
    badCredentials.status = 401;
    loginApiMock.mockRejectedValue(badCredentials);

    await act(async () => {
      await hookResult.handleRegister(
        "New",
        "Owner",
        "newowner",
        "1234",
        "My Pharmacy",
        undefined,
        "owner@example.com",
        "wrong-password",
      );
    });

    expect(toastErrorMock).toHaveBeenCalledWith("Invalid credentials");
    expect(routerPushMock).not.toHaveBeenCalledWith("/dashboard");
  });
});
