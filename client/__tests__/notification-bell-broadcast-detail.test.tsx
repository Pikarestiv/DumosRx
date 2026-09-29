import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A broadcast's message is line-clamped in the bell's list, which is right for
 * a compact list but left the full text unreachable. Clicking the row now
 * opens the shared ResponsiveModal detail view (the house
 * "row -> <Entity>DetailModal" pattern), and the list stays clamped.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const LONG_MESSAGE =
  "Scheduled maintenance will run this Sunday from 01:00 to 04:00. " +
  "During that window the cloud sync will be paused, though every till " +
  "keeps selling offline as usual, and queued changes push automatically " +
  "once the window closes. No action is needed from your staff.";

const push = vi.fn();
const onOpen = vi.fn();

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, isCloudLinked: true }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "store-1" } }),
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
    data: [
      {
        id: "b1",
        title: "Scheduled maintenance",
        message: LONG_MESSAGE,
        type: "info",
      },
    ],
  }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getNotifications: vi.fn(async () => [
      {
        id: "n1",
        title: "Low stock alert",
        description: "Paracetamol is running low.",
        time: "2h ago",
        type: "stock",
        isRead: false,
        category: "system",
        link: "/inventory/overview",
      },
    ]),
    markNotificationRead: vi.fn(async () => undefined),
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
    // Desktop width, so ResponsiveModal takes its Dialog branch.
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

function renderBell() {
  render(<NotificationBell />, { wrapper });
}

function openBell() {
  const trigger = screen.getByRole("button", { name: /notifications/i });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return trigger;
}

async function broadcastRow() {
  return (await screen.findByText("Scheduled maintenance")).closest(
    "[role='menuitem']",
  ) as HTMLElement;
}

describe("Notification bell broadcast detail", () => {
  beforeEach(() => {
    push.mockReset();
    onOpen.mockReset();
    localStorage.clear();
  });

  it("opens a detail view with the full, unclamped broadcast message when the row is clicked", async () => {
    renderBell();
    openBell();

    fireEvent.click(await broadcastRow());

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Scheduled maintenance");
    const message = within(dialog).getByText(LONG_MESSAGE);
    expect(message.className).not.toContain("line-clamp");
  });

  it("keeps the list row's message truncated", async () => {
    renderBell();
    openBell();

    const row = await broadcastRow();
    const listMessage = row.querySelector(".line-clamp-2");
    expect(listMessage).not.toBeNull();
    expect(listMessage?.textContent).toBe(LONG_MESSAGE);
  });

  it("closes the detail view without leaving the bell unusable", async () => {
    renderBell();
    openBell();

    fireEvent.click(await broadcastRow());
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.pointerEvents).not.toBe("none");

    openBell();
    expect(await broadcastRow()).toBeTruthy();
  });

  it("leaves a linked notification's navigation alone", async () => {
    renderBell();
    openBell();

    const linked = (await screen.findByText("Low stock alert")).closest(
      "[role='menuitem']",
    ) as HTMLElement;
    fireEvent.click(linked);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/inventory/overview"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
