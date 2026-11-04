import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { CurrentUser } from "@/lib/types/user";

const { auth, currentUserHook, mutateProfile } = vi.hoisted(() => ({
  auth: { user: { id: "u-1", username: "fallback_admin", email: "fallback@example.com" } },
  currentUserHook: {
    data: {
      id: "u-1",
      first_name: "John",
      last_name: "Doe",
      username: "johndoe",
      email: "john@example.com",
      phone: "+1234567890",
      role: "store_owner",
    } as CurrentUser | undefined,
    isLoading: false,
    isError: false,
  },
  mutateProfile: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/hooks/use-current-user", () => ({
  useCurrentUser: () => currentUserHook,
  useUpdateProfileMutation: () => mutateProfile,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { ProfileSettings } from "@/components/settings/account/profile-settings";

describe("ProfileSettings username display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserHook.isLoading = false;
    currentUserHook.isError = false;
    currentUserHook.data = {
      id: "u-1",
      first_name: "John",
      last_name: "Doe",
      username: "johndoe",
      email: "john@example.com",
      phone: "+1234567890",
      role: "store_owner",
    };
  });

  it("renders the username input with value from current user", () => {
    render(<ProfileSettings />);

    const usernameInput = screen.getByLabelText("Username") as HTMLInputElement;
    expect(usernameInput).toBeDefined();
    expect(usernameInput.value).toBe("johndoe");
    expect(usernameInput.disabled).toBe(true);
    expect(screen.getByText("Used to sign in on tills.")).toBeDefined();
  });

  it("falls back to local auth username when current user data has no username", () => {
    currentUserHook.data = {
      id: "u-1",
      first_name: "John",
      last_name: "Doe",
      username: null,
      email: "john@example.com",
      role: "store_owner",
    };

    render(<ProfileSettings />);

    const usernameInput = screen.getByLabelText("Username") as HTMLInputElement;
    expect(usernameInput.value).toBe("fallback_admin");
  });
});
