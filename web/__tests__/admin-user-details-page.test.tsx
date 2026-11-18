import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { params, request } = vi.hoisted(() => ({ params: { id: "u-123" as string | null }, request: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === "id" ? params.id : null) }),
}));
vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));
vi.mock("@/hooks/use-platform-role-options", () => ({ usePlatformRoleOptions: () => [] }));

import UserDetailsPage from "@/app/admin/users/details/page";

const ada = { id: "u-123", name: "Ada Admin", email: "ada@dumosrx.com", role: "Platform Admin", role_slug: "platform_admin", status: "Active" };

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <UserDetailsPage />
    </QueryClientProvider>,
  );

describe("User details page", () => {
  beforeEach(() => {
    params.id = "u-123";
    request.mockReset();
  });

  it("shows the person whose id is in the address, not a lookalike from the same search", async () => {
    request.mockResolvedValue({ data: [{ ...ada, id: "u-1234", name: "Not Ada" }, ada], meta: { total: 2, last_page: 1 } });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Ada Admin" })).toBeTruthy();
    expect(screen.queryByText("Not Ada")).toBeNull();
    expect(screen.getByRole("button", { name: /users/i })).toBeTruthy();
  });

  it("says so when no user matches, and offers the way back", async () => {
    request.mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } });

    renderPage();

    expect(await screen.findByText("No user was found.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /users/i })).toBeTruthy();
  });

  it("says so when no id was given", async () => {
    params.id = null;

    renderPage();

    expect(await screen.findByText("No user was found.")).toBeTruthy();
  });
});
