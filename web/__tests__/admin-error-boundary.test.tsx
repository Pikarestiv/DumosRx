import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockReportClientError, mockPush } = vi.hoisted(() => ({
  mockReportClientError: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("@/lib/api/logger", () => ({
  reportClientError: mockReportClientError,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import AdminError from "@/app/admin/error";

describe("admin error boundary", () => {
  beforeEach(() => {
    mockReportClientError.mockClear();
    mockPush.mockClear();
  });

  it("shows a recoverable card instead of the browser crash screen", () => {
    render(<AdminError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls reset() when the recovery button is pressed", async () => {
    const reset = vi.fn();
    render(<AdminError error={new Error("boom")} reset={reset} />);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reports the crash through the existing client-error channel", () => {
    const error = Object.assign(new Error("t.enabled_payment_methods.join is not a function"), {
      digest: "abc123",
    });

    render(<AdminError error={error} reset={vi.fn()} />);

    expect(mockReportClientError).toHaveBeenCalledTimes(1);
    const [method, , status, message] = mockReportClientError.mock.calls[0];
    expect(method).toBe("RENDER");
    expect(status).toBeUndefined();
    expect(message).toContain("t.enabled_payment_methods.join is not a function");
  });

  it("offers an escape hatch back to the dashboard", async () => {
    const reset = vi.fn();
    render(<AdminError error={new Error("boom")} reset={reset} />);

    await userEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));

    expect(mockPush).toHaveBeenCalledWith("/admin");
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reports a crash only once per error, not on every re-render", () => {
    const error = new Error("boom");
    const { rerender } = render(<AdminError error={error} reset={vi.fn()} />);
    rerender(<AdminError error={error} reset={vi.fn()} />);

    expect(mockReportClientError).toHaveBeenCalledTimes(1);
  });
});
