import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionsList } from "@/components/settings/account/sessions-list";
import type { Session } from "@/lib/types/user";

vi.mock("@/lib/utils/device-id", () => ({
  getDeviceId: () => "DRX-LOCAL-TILL-1",
}));

const mockSessions: Session[] = [
  {
    id: "token-1",
    name: "Client App",
    device_id: "DRX-LOCAL-TILL-1",
    ip_address: "192.168.1.50",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    last_used_at: "2026-11-03T22:50:00Z",
    created_at: "2026-11-01T10:00:00Z",
    is_current: true,
  },
  {
    id: "token-2",
    name: "web",
    device_id: "DRX-WEB-REMOTE-9",
    ip_address: null,
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    last_used_at: "2026-11-03T21:15:00Z",
    created_at: "2026-11-02T12:00:00Z",
    is_current: false,
  },
  {
    id: "token-3",
    name: "web",
    device_id: null,
    ip_address: null,
    user_agent: null,
    last_used_at: "2026-11-03T20:00:00Z",
    created_at: "2026-11-02T12:00:00Z",
    is_current: false,
  },
];

let queryData = mockSessions;
let queryIsLoading = false;

vi.mock("@/lib/hooks/use-sessions", () => ({
  useSessions: () => ({ data: queryData, isLoading: queryIsLoading, isError: false }),
  useRevokeSessionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeAllSessionsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/settings/account/relink-code-dialog", () => ({
  RelinkCodeDialog: () => <div data-testid="relink-code-dialog" />,
}));

describe("SessionsList", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryData = mockSessions;
    queryIsLoading = false;
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <SessionsList />
      </QueryClientProvider>,
    );

  it("renders device IDs for current and remote sessions", () => {
    renderComponent();

    expect(screen.getByText("DRX-LOCAL-TILL-1")).toBeTruthy();
    expect(screen.getByText("DRX-WEB-REMOTE-9")).toBeTruthy();
  });

  it("renders Current Device badge for the active session", () => {
    renderComponent();

    expect(screen.getByText("Current Device")).toBeTruthy();
  });

  it("falls back to UA parsing for generic 'web' device name", () => {
    renderComponent();

    expect(screen.getByText("Chrome on Windows 10/11")).toBeTruthy();
    expect(screen.getByText("Web Browser")).toBeTruthy();
  });

  it("renders IP address and fallback for Unknown IP", () => {
    renderComponent();

    expect(screen.getByText(/192\.168\.1\.50/)).toBeTruthy();
    expect(screen.getAllByText(/Unknown IP/).length).toBe(2);
  });
});
