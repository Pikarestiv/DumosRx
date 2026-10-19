import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminHeaderRefresh } from "@/components/admin/admin-header-refresh";

/**
 * An installed admin PWA has no pull-to-refresh and no address bar, so without
 * this control a phone had no way to get fresh figures at all.
 */
describe("AdminHeaderRefresh", () => {
  const renderIt = (client: QueryClient) =>
    render(
      <QueryClientProvider client={client}>
        <AdminHeaderRefresh />
      </QueryClientProvider>,
    );

  it("refetches every query the panel holds", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderIt(client);

    await userEvent.click(screen.getByRole("button", { name: /refresh data/i }));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click until the first refresh settles", async () => {
    const client = new QueryClient();
    let release: (() => void) | undefined;
    const invalidate = vi
      .spyOn(client, "invalidateQueries")
      .mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    renderIt(client);

    const button = screen.getByRole("button", { name: /refresh data/i });
    await userEvent.click(button);
    expect(button).toBeDisabled();

    release?.();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
