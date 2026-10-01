import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

let storeProfile: Record<string, unknown> | null = null;
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useAssistantPanel } from "@/lib/store/use-assistant-panel";

/**
 * The launcher stays visible on a plan without the assistant and upsells on
 * click (the withRestriction toast pattern) rather than disappearing — it is
 * an existing, visible feature being restricted, not a new one.
 */
describe("AssistantLauncher plan gate", () => {
  beforeEach(() => {
    toastError.mockClear();
    useAssistantPanel.setState({ isOpen: false });
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  });

  async function renderLauncher() {
    const { AssistantLauncher } = await import("@/components/assistant/assistant-launcher");
    render(<AssistantLauncher />);
    return screen.getByRole("button");
  }

  it("opens the panel on an entitled plan", async () => {
    storeProfile = { subscription_tier: "pro" };
    fireEvent.click(await renderLauncher());
    expect(useAssistantPanel.getState().isOpen).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the launcher visible but blocks opening on an unentitled plan", async () => {
    storeProfile = { subscription_tier: "starter" };
    const button = await renderLauncher();
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(useAssistantPanel.getState().isOpen).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Feature Locked", expect.anything());
  });
});

describe("AssistantPanel render gate", () => {
  beforeEach(() => {
    useAssistantPanel.setState({ isOpen: true, messages: [] });
  });

  it("does not render the panel on an unentitled plan even when its store says open", async () => {
    storeProfile = { subscription_tier: "free" };
    const { GatedAssistantPanel } = await import("@/components/assistant/gated-assistant-panel");
    const { container } = render(<GatedAssistantPanel />);
    expect(container.innerHTML).toBe("");
  });
});
