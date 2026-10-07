import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: { url: "https://api.dumosrx.com/api/v1" } }));

vi.mock("@/lib/api/base-client", () => ({
  getBaseURL: () => api.url,
  setBaseURL: vi.fn(),
}));

const { useApiEnvironmentName } = await import("@/hooks/use-api-environment");

function Probe() {
  const { environmentName, isProduction } = useApiEnvironmentName();
  return <span>{`${environmentName}|${isProduction}`}</span>;
}

/**
 * Now that a super admin can switch servers from a production build, the
 * build's baked-in NEXT_PUBLIC_APP_ENV no longer says which database the next
 * migration would touch. Only the live base URL does — and this label is what
 * the migration dialog's irreversible warning is written from.
 */
describe("useApiEnvironmentName with a server override in effect", () => {
  it("says staging when a production build is pointed at the dev API", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    api.url = "https://api.dev.dumosrx.com/api/v1";

    render(<Probe />);

    await waitFor(() => expect(screen.getByText("Staging / Dev|false")).toBeDefined());
    vi.unstubAllEnvs();
  });

  it("says production when pointed at the production API", async () => {
    api.url = "https://api.dumosrx.com/api/v1";

    render(<Probe />);

    await waitFor(() => expect(screen.getByText("Production|true")).toBeDefined());
  });

  /** An unrecognised server must not read as production by default. */
  it("does not claim production for a server it does not recognise", async () => {
    api.url = "https://api.someone-elses-box.test/api/v1";

    render(<Probe />);

    await waitFor(() => expect(screen.getByText(/\|false$/)).toBeDefined());
  });
});
