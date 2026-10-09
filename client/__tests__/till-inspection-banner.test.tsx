import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { TillInspectionBanner } from "@/components/dashboard/till-inspection-banner";
import {
  startTillInspectionSession,
  isTillInspectionSession,
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

const { ended } = vi.hoisted(() => ({ ended: { calls: [] as string[] } }));

vi.mock("@/lib/api/admin-till-session", () => ({
  endAdminTillSession: vi.fn(async (_id: string, reason: string) => {
    ended.calls.push(reason);
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "s1", name: "Agidi Branch" } }),
}));

const assign = vi.fn();

const live = (overrides: Partial<TillInspectionSession> = {}): TillInspectionSession => ({
  admin: {
    id: "a1",
    first_name: "Ops",
    last_name: "Admin",
    email: "ops@dumosrx.com",
    role: "platform_admin",
  },
  sessionId: "sess-1",
  hardExpiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
  idleExpiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
  storeId: "s1",
  deviceId: "till-7",
  ...overrides,
});

describe("TillInspectionBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
    ended.calls = [];
    assign.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { set href(url: string) { assign(url); }, get href() { return "/"; } },
    });
  });

  afterEach(() => vi.useRealTimers());

  it("renders nothing with no session", () => {
    const { container } = render(<TillInspectionBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("names the admin and the store, and says it is read-only", () => {
    startTillInspectionSession(live());
    render(<TillInspectionBanner />);

    expect(screen.getByText(/read-only admin inspection/i)).toBeTruthy();
    expect(screen.getByText(/ops@dumosrx.com/)).toBeTruthy();
    expect(screen.getByText(/Agidi Branch/)).toBeTruthy();
  });

  it("warns with a countdown inside the warning window rather than ending silently", () => {
    vi.useFakeTimers();
    startTillInspectionSession(live({
      idleExpiresAt: new Date(Date.now() + 90_000).toISOString(),
    }));
    render(<TillInspectionBanner />);

    act(() => void vi.advanceTimersByTime(1_000));

    expect(screen.getByText(/ending in/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /stay signed in/i })).toBeTruthy();
  });

  it("shows no countdown while the session is comfortably alive", () => {
    vi.useFakeTimers();
    startTillInspectionSession(live());
    render(<TillInspectionBanner />);

    act(() => void vi.advanceTimersByTime(1_000));

    expect(screen.queryByText(/ending in/i)).toBeNull();
  });

  it("ends the session as idle when both deadlines pass", async () => {
    vi.useFakeTimers();
    startTillInspectionSession(live({
      idleExpiresAt: new Date(Date.now() + 500).toISOString(),
    }));
    render(<TillInspectionBanner />);

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });

    expect(ended.calls).toEqual(["idle"]);
    expect(isTillInspectionSession()).toBe(false);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("ends the session as signed_out on the button, and clears it locally", async () => {
    startTillInspectionSession(live());
    render(<TillInspectionBanner />);

    fireEvent.click(screen.getByRole("button", { name: /end session/i }));

    await waitFor(() => expect(ended.calls).toEqual(["signed_out"]));
    expect(isTillInspectionSession()).toBe(false);
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
