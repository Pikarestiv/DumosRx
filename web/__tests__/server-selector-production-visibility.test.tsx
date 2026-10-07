import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api/base-client", () => ({
  getBaseURL: () => "https://api.dumosrx.com/api/v1",
  setBaseURL: vi.fn(),
  getAppURL: () => "https://app.dumosrx.com",
  setAppURL: vi.fn(),
}));

const { ServerSelector } = await import("@/components/ui/server-selector");

/**
 * The selector is hidden in production builds so a customer can never point
 * their app at the wrong API. A super admin running the installed PWA on a
 * phone does need it — so it becomes opt-in per call site rather than
 * globally ungated, and the default stays hidden.
 */
describe("ServerSelector in a production build", () => {
  const setProduction = () => vi.stubEnv("NODE_ENV", "production");
  const restore = () => vi.unstubAllEnvs();

  it("stays hidden by default", () => {
    setProduction();
    const { container } = render(<ServerSelector />);
    restore();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders when a call site explicitly allows it", () => {
    setProduction();
    render(<ServerSelector allowInProduction />);
    restore();

    expect(screen.getByRole("button", { name: /server config/i })).toBeDefined();
  });

  it("still renders outside production without the flag", () => {
    render(<ServerSelector />);

    expect(screen.getByRole("button", { name: /server config/i })).toBeDefined();
  });
});
