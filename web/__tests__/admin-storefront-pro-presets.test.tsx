import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { request, toastSuccess, server } = vi.hoisted(() => ({
  request: vi.fn(),
  toastSuccess: vi.fn(),
  server: { affected: {} as Record<string, number>, switching: 0 },
}));

vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

import { StorefrontProPresetsCard } from "@/components/admin/views/storefront-pro-presets-card";

const PRESETS = ["workshop", "clinic", "studio", "market", "boutique", "grove"];

function fakeServer(url: string, options?: { method?: string; body?: { presets: string[] } }) {
  if (options?.method === "PUT") return Promise.resolve({ allowed: options.body?.presets, stores_switched: server.switching });
  const overview = {
    presets: PRESETS,
    allowed: ["workshop", "clinic", "market"],
    default: ["workshop", "clinic", "market"],
    affected: { workshop: 0, clinic: 0, studio: 0, market: 0, boutique: 0, grove: 0, ...server.affected },
  };
  return Promise.resolve(url.includes("proposed=") ? { ...overview, switching: { count: server.switching, to: "workshop" } } : overview);
}

const puts = () => request.mock.calls.filter(([, options]) => options?.method === "PUT");

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <StorefrontProPresetsCard />
    </QueryClientProvider>,
  );
}

describe("StorefrontProPresetsCard", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(fakeServer);
    toastSuccess.mockReset();
    server.affected = {};
    server.switching = 0;
  });

  it("lists every preset, ticks the Pro ones and shows how many Pro storefronts use each", async () => {
    server.affected = { clinic: 2 };
    renderCard();

    const clinic = await screen.findByRole("checkbox", { name: /Clinic/ });
    expect(clinic.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /Studio/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.getByText("2 Pro storefronts")).toBeTruthy();
  });

  it("saves an added preset straight away, with no confirmation", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Grove/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Pro presets" }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][1].body).toEqual({ presets: ["workshop", "clinic", "market", "grove"] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves the removal of a preset nobody uses without asking", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Market/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Pro presets" }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks first, with a fresh count, before removing a preset Pro storefronts use", async () => {
    server.affected = { clinic: 2 };
    server.switching = 3;
    renderCard();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Clinic/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Pro presets" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/3 Pro storefronts will switch to Workshop/);
    expect(request.mock.calls.some(([url]) => String(url).includes("proposed=workshop%2Cmarket"))).toBe(true);
    expect(puts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(puts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save Pro presets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Switch them" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
  });

  it("will not save an empty list", async () => {
    renderCard();
    for (const name of [/Workshop/, /Clinic/, /Market/]) {
      fireEvent.click(await screen.findByRole("checkbox", { name }));
    }

    expect((screen.getByRole("button", { name: "Save Pro presets" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at least one/i)).toBeTruthy();
  });
});
