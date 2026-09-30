import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/components/ui/responsive-modal", () => ({
  ResponsiveModal: ({
    open,
    title,
    description,
    children,
    footer,
  }: {
    open: boolean;
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div>
        <div>{title}</div>
        <div>{description}</div>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: ["view_reports"] },
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { currency: "NGN", expiry_warning_days: 90 },
    storeType: "pharmacy",
    t: (k: string) => k,
    activeStoreId: "store1",
  }),
}));

const answer = vi.fn(async () => ({
  kind: "help",
  text: "Make a sale: Open POS",
  actions: [{ label: "Make a sale", href: "/pos" }],
}));

vi.mock("@/lib/assistant/router", () => ({
  answer: (...args: unknown[]) => answer(...(args as [])),
}));

describe("AssistantPanel", () => {
  beforeEach(async () => {
    answer.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    useAssistantPanel.setState({ isOpen: true, messages: [] });
  });

  it("sends a message and shows the reply with an action link", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    render(<AssistantPanel />);

    const input = screen.getByLabelText("Ask the assistant");
    fireEvent.change(input, { target: { value: "how do i make a sale" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/Make a sale: Open POS/)).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Make a sale" }).getAttribute("href")).toBe("/pos");
  });

  it("closes the panel when an action link is clicked", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    render(<AssistantPanel />);

    const input = screen.getByLabelText("Ask the assistant");
    fireEvent.change(input, { target: { value: "how do i make a sale" } });
    fireEvent.submit(input.closest("form")!);

    const link = await screen.findByRole("link", { name: "Make a sale" });
    fireEvent.click(link);

    expect(useAssistantPanel.getState().isOpen).toBe(false);
  });

  it("scrolls the newest message into view", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    render(<AssistantPanel />);

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    const input = screen.getByLabelText("Ask the assistant");
    fireEvent.change(input, { target: { value: "how do i make a sale" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/Make a sale: Open POS/)).toBeTruthy();
    });
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("stays usable when sending throws instead of resolving", async () => {
    answer.mockRejectedValueOnce(new Error("context blew up"));
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    render(<AssistantPanel />);

    const input = screen.getByLabelText("Ask the assistant") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "boom" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect((screen.getByLabelText("Ask the assistant") as HTMLInputElement).disabled).toBe(false);
    });
    expect(input.value).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", onRejection);
    expect(rejections).toEqual([]);
  });
});
