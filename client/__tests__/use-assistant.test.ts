import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { id: "g1", permissions: ["view_reports"] },
  })),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: vi.fn(() => ({
    storeProfile: { currency: "NGN", expiry_warning_days: 90 },
    storeType: "pharmacy",
    t: (k: string) => k,
    activeStoreId: "store1",
  })),
}));

vi.mock("@/lib/assistant/router", () => ({
  answer: vi.fn(async (text: string) => ({ kind: "answer", text: `echo: ${text}` })),
}));

describe("useAssistant", () => {
  beforeEach(async () => {
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    useAssistantPanel.getState().clear();
  });

  it("appends the user message and the assistant reply", async () => {
    const { useAssistant } = await import("@/lib/hooks/use-assistant");
    const { result } = renderHook(() => useAssistant());

    await act(async () => {
      await result.current.send("hello");
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages[0]).toMatchObject({ role: "user", text: "hello" });
    expect(result.current.messages[1]).toMatchObject({ role: "assistant", text: "echo: hello" });
    expect(result.current.isThinking).toBe(false);
  });

  it("exposes permitted tool examples as suggestions", async () => {
    const { useAssistant } = await import("@/lib/hooks/use-assistant");
    const { TOOL_REGISTRY } = await import("@/lib/assistant/tools");
    const { result } = renderHook(() => useAssistant());

    const allExamples = Array.from(TOOL_REGISTRY.values()).flatMap((tool) => tool.examples);
    expect(result.current.suggestions.length).toBeGreaterThan(0);
    expect(result.current.suggestions.length).toBeLessThanOrEqual(5);
    for (const suggestion of result.current.suggestions) {
      expect(allExamples).toContain(suggestion);
    }
  });

  it("does not suggest a question an auditor would only be refused", async () => {
    const authContext = await import("@/lib/context/auth-context");
    const { DEFAULT_GROUP_PERMISSIONS } = await import("@/lib/constants/permissions");
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: "u9", role: "auditor" },
      permissionGroup: { id: "g9", permissions: DEFAULT_GROUP_PERMISSIONS.auditor },
    } as ReturnType<typeof authContext.useAuth>);

    const { useAssistant } = await import("@/lib/hooks/use-assistant");
    const { result } = renderHook(() => useAssistant());

    expect(result.current.suggestions).not.toContain("how do i make a sale");
    expect(result.current.suggestions).not.toContain("my sales today");
    expect(result.current.suggestions.length).toBeGreaterThan(0);

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: "u1", role: "store_owner" },
      permissionGroup: { id: "g1", permissions: ["view_reports"] },
    } as ReturnType<typeof authContext.useAuth>);
  });

  it("clears the thread when the store switches", async () => {
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    const { useAssistant } = await import("@/lib/hooks/use-assistant");
    const { result, rerender } = renderHook(() => useAssistant());

    await act(async () => {
      await result.current.send("hello");
    });
    expect(useAssistantPanel.getState().messages.length).toBeGreaterThan(0);

    const storeContext = await import("@/lib/context/store-context");
    vi.mocked(storeContext.useStore).mockReturnValue({
      storeProfile: { currency: "NGN", expiry_warning_days: 90 },
      storeType: "pharmacy",
      t: (k: string) => k,
      activeStoreId: "store2",
    } as ReturnType<typeof storeContext.useStore>);

    rerender();
    await waitFor(() => {
      expect(useAssistantPanel.getState().messages).toHaveLength(0);
    });
  });
});
