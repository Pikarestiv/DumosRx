import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

const drawerProps = vi.hoisted(() => ({
  repositionInputs: undefined as boolean | undefined,
  contentStyle: undefined as React.CSSProperties | undefined,
  contentClassName: undefined as string | undefined,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => false,
  useResolvedMediaQuery: () => ({ matches: false, resolved: true }),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({
    open,
    repositionInputs,
    children,
  }: {
    open: boolean;
    repositionInputs?: boolean;
    children: React.ReactNode;
  }) => {
    drawerProps.repositionInputs = repositionInputs;
    return open ? <div role="dialog">{children}</div> : null;
  },
  DrawerContent: ({
    children,
    style,
    className,
    onOpenAutoFocus,
  }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
    onOpenAutoFocus?: (event: Event) => void;
  }) => {
    drawerProps.contentStyle = style;
    drawerProps.contentClassName = className;
    React.useEffect(() => {
      onOpenAutoFocus?.(new Event("focus"));
    }, [onOpenAutoFocus]);
    return <div>{children}</div>;
  },
  DrawerHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DrawerTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  DrawerDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  ),
  DrawerClose: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button className={className}>{children}</button>
  ),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "store_owner", first_name: "Ada", last_name: "Bell" },
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

vi.mock("@/lib/assistant/router", () => ({
  answer: vi.fn(),
}));

describe("AssistantPanel mobile keyboard-avoiding drawer", () => {
  beforeEach(async () => {
    drawerProps.repositionInputs = undefined;
    drawerProps.contentStyle = undefined;
    drawerProps.contentClassName = undefined;
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    useAssistantPanel.setState({ isOpen: true, messages: [] });
  });

  it("disables Vaul repositionInputs and anchors bottom/maxHeight to visualViewport variables", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    render(<AssistantPanel />);

    expect(drawerProps.repositionInputs).toBe(false);
    expect(drawerProps.contentStyle?.bottom).toBe("var(--kb-inset, 0px)");
    expect(String(drawerProps.contentStyle?.maxHeight)).toContain("var(--vv-height, 100dvh)");
    expect(String(drawerProps.contentStyle?.maxHeight)).toContain("env(safe-area-inset-top, 0px)");
    expect(drawerProps.contentStyle?.paddingBottom).toBe("0px");
    expect(drawerProps.contentClassName).toContain("mt-0");
  });

  it("does not auto-focus the composer on mobile open so the keyboard does not fight the drawer animation", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    render(<AssistantPanel />);

    const input = screen.getByLabelText("Ask the assistant");
    expect(document.activeElement).not.toBe(input);
  });
});
