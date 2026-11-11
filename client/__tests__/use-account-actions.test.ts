import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAccountActions } from "@/lib/hooks/use-account-actions";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canUseAiAssistant: true,
    withRestriction: (fn: () => void) => fn,
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({ data: 0 }),
  };
});

describe("useAccountActions", () => {
  it("provides Help & Support navigation action routing to /help", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useAccountActions({ onClose }));

    const helpAction = result.current.navActions.find((a) => a.key === "help");
    expect(helpAction).toBeDefined();
    expect(helpAction?.label).toBe("Help & Support");

    helpAction?.onClick();
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/help");
  });
});
