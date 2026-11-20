import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  formatNotificationTitle,
  formatNotificationDescription,
  getNotificationBadge,
} from "@/components/dashboard/format-notification";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const { push, onOpen, markAllNotificationsRead, markNotificationRead } = vi.hoisted(() => ({
  push: vi.fn(),
  onOpen: vi.fn(),
  markAllNotificationsRead: vi.fn(() => Promise.resolve(undefined)),
  markNotificationRead: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/db/queries/payables", () => ({
  getPayablesDueSummary: vi.fn(() =>
    Promise.resolve({
      overdueCount: 2,
      overdueTotal: 843190,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    }),
  ),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, isCloudLinked: true }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "store-1", currency: "NGN" } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/store/use-online-orders-modal", () => ({
  useOnlineOrdersModal: () => ({ onOpen }),
}));

vi.mock("@/lib/hooks/use-is-touch-device", () => ({
  useIsTouchDevice: () => false,
}));

vi.mock("@/lib/hooks/use-broadcasts", () => ({
  useBroadcasts: () => ({
    data: [],
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getNotifications: vi.fn(() =>
      Promise.resolve([
        {
          id: "n-trial-ent",
          title: "Free Trial Granted",
          description: "You've been granted an Enterprise Free Trial, valid until 24/12/2026. Enjoy!",
          time: "2 weeks ago",
          type: "info",
          isRead: false,
          category: "system",
        },
        {
          id: "n-trial-pro",
          title: "Free Trial Granted",
          description: "You've been granted a Pro Free Trial, valid until 21/10/2026. Enjoy!",
          time: "1 month ago",
          type: "info",
          isRead: true,
          category: "system",
        },
        {
          id: "n-relink",
          title: "TILL_RELINK_CODE_ISSUED",
          description: "Till re-link code issued",
          time: "2 days ago",
          type: "info",
          isRead: true,
          category: "log",
        },
        {
          id: "n-po",
          title: "RECEIVE_PO",
          description: "Action: RECEIVE_PO on purchase_orders",
          time: "2 days ago",
          type: "info",
          isRead: true,
          category: "log",
        },
      ]),
    ),
    markNotificationRead,
    markAllNotificationsRead,
  },
}));

import { NotificationBell } from "@/components/dashboard/notification-bell";

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 768px"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function openBell() {
  const trigger = screen.getByRole("button", { name: /notifications/i });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
}

describe("Notification formatting utils", () => {
  it("formats snake-case action titles to human readable Title Case", () => {
    expect(formatNotificationTitle("TILL_RELINK_CODE_ISSUED")).toBe("Till Relink Code Issued");
    expect(formatNotificationTitle("RECEIVE_PO")).toBe("Purchase Order Received");
    expect(formatNotificationTitle("SALE_RETURN")).toBe("Sale Return Processed");
    expect(formatNotificationTitle("STOCK_ADJUSTMENT")).toBe("Stock Adjustment");
    expect(formatNotificationTitle("UNKNOWN_CUSTOM_ACTION")).toBe("Unknown Custom Action");
  });

  it("formats developer action descriptions into human sentences", () => {
    expect(formatNotificationDescription("Action: RECEIVE_PO on purchase_orders")).toBe(
      "Goods received and recorded into inventory.",
    );
    expect(formatNotificationDescription("Action: SALE_RETURN on sales")).toBe(
      "Customer sale return was completed.",
    );
    expect(formatNotificationDescription("Till re-link code issued")).toBe(
      "A one-time re-link code was generated for your till.",
    );
  });

  it("identifies contextual plan and category badges", () => {
    expect(
      getNotificationBadge({
        id: "1",
        title: "Free Trial Granted",
        description: "You've been granted an Enterprise Free Trial",
        time: "1d ago",
        type: "info",
        isRead: false,
        category: "system",
      })?.label,
    ).toBe("Enterprise");

    expect(
      getNotificationBadge({
        id: "2",
        title: "Free Trial Granted",
        description: "You've been granted a Pro Free Trial",
        time: "1d ago",
        type: "info",
        isRead: false,
        category: "system",
      })?.label,
    ).toBe("Pro");

    expect(
      getNotificationBadge({
        id: "3",
        title: "2 Supplier Payments Overdue",
        description: "Overdue payments",
        time: "Payables",
        type: "danger",
        isRead: false,
        category: "payable",
      })?.label,
    ).toBe("Payables");
  });
});

describe("Notification Bell Redesign UI", () => {
  beforeEach(() => {
    push.mockReset();
    onOpen.mockReset();
    markAllNotificationsRead.mockClear();
    markNotificationRead.mockClear();
    localStorage.clear();
  });

  it("renders human readable titles and descriptions with zero snake casing", async () => {
    render(<NotificationBell />, { wrapper });
    openBell();

    expect(await screen.findByText("Till Relink Code Issued")).toBeTruthy();
    expect(screen.queryByText("TILL_RELINK_CODE_ISSUED")).toBeNull();

    expect(await screen.findByText("Purchase Order Received")).toBeTruthy();
    expect(screen.queryByText("RECEIVE_PO")).toBeNull();

    expect(
      await screen.findByText("Goods received and recorded into inventory."),
    ).toBeTruthy();
    expect(screen.queryByText("Action: RECEIVE_PO on purchase_orders")).toBeNull();
  });

  it("displays unread count badge in header and mark all as read button", async () => {
    render(<NotificationBell />, { wrapper });
    openBell();

    expect(await screen.findByText(/Unread/)).toBeTruthy();
    const markAllBtn = await screen.findByRole("button", { name: "Mark all as read" });
    expect(markAllBtn).toBeTruthy();

    fireEvent.click(markAllBtn);
    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalled();
    });
  });

  it("renders plan badges and View Details link for payables", async () => {
    render(<NotificationBell />, { wrapper });
    openBell();

    expect(await screen.findByText("Enterprise")).toBeTruthy();
    expect(await screen.findByText("Pro")).toBeTruthy();
    expect(await screen.findByText("Payables")).toBeTruthy();
    expect(await screen.findByText("View Details")).toBeTruthy();
  });
});
