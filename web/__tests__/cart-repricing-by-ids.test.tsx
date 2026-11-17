import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api/base-client", () => ({ apiClient: { get: getMock } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

import { useCartRepricing } from "@/lib/store/use-cart-repricing";
import { useCartStore } from "@/lib/store/use-cart-store";

const item = (id: string, price = 100) => ({ id, name: `Item ${id}`, price, quantity: 1 });

describe("cart repricing", () => {
  beforeEach(() => {
    getMock.mockReset();
    act(() => useCartStore.setState({ carts: {} }));
  });

  it("looks the cart's own products up by id, so an item far down a large catalog is not dropped", async () => {
    act(() => useCartStore.setState({ carts: { shop: [item("deep-120"), item("near-3")] } }));
    getMock.mockResolvedValue({
      data: {
        data: [
          { id: "deep-120", selling_price: 100 },
          { id: "near-3", selling_price: 100 },
        ],
        store: { currency: "XAF", online_payment_available: true },
      },
    });

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(getMock).toHaveBeenCalledWith("/storefront/shop/products", { params: { ids: "deep-120,near-3", per_page: 100 } });
    expect(useCartStore.getState().carts.shop.map((i) => i.id)).toEqual(["deep-120", "near-3"]);
    expect(result.current.currency).toBe("XAF");
    expect(result.current.onlinePaymentAvailable).toBe(true);
  });

  it("still removes an item the store no longer lists, and updates a changed price", async () => {
    act(() => useCartStore.setState({ carts: { shop: [item("gone"), item("dearer", 100)] } }));
    getMock.mockResolvedValue({ data: { data: [{ id: "dearer", selling_price: 150 }], store: {} } });

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(useCartStore.getState().carts.shop).toEqual([{ ...item("dearer"), price: 150 }]);
  });

  it("asks about at most 100 items and leaves any beyond that exactly as they were", async () => {
    const many = Array.from({ length: 105 }, (_, i) => item(`p${i}`));
    act(() => useCartStore.setState({ carts: { shop: many } }));
    getMock.mockImplementation((_url: string, { params }: { params: { ids: string } }) =>
      Promise.resolve({ data: { data: params.ids.split(",").map((id) => ({ id, selling_price: 100 })), store: {} } }),
    );

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(getMock.mock.calls[0][1].params.ids.split(",")).toHaveLength(100);
    expect(useCartStore.getState().carts.shop).toHaveLength(105);
  });

  it("does not call the API for an empty cart", async () => {
    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(getMock).not.toHaveBeenCalled();
  });

  it("marks prices stale, without touching the cart, when the lookup fails", async () => {
    act(() => useCartStore.setState({ carts: { shop: [item("a")] } }));
    getMock.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesStale).toBe(true));

    expect(useCartStore.getState().carts.shop).toHaveLength(1);
  });

  it("marks prices stale, and removes nothing, when an older API ignores ids and answers with other products", async () => {
    act(() => useCartStore.setState({ carts: { shop: [item("deep-120")] } }));
    getMock.mockResolvedValue({ data: { data: [{ id: "first-alphabetically", selling_price: 5 }], store: {} } });

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(result.current.pricesStale).toBe(true);
    expect(useCartStore.getState().carts.shop.map((i) => i.id)).toEqual(["deep-120"]);
  });

  it("reprices a booked service from the services list and drops one the store stopped offering", async () => {
    const service = (id: string, price = 100) => ({ ...item(id, price), kind: "service" as const });
    act(() => useCartStore.setState({ carts: { shop: [item("p1"), service("svc-kept"), service("svc-gone")] } }));
    getMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/services")
          ? { data: { data: [{ id: "svc-kept", name: "Scaling", price: 25000 }, { id: "svc-other", name: "Other", price: 1 }] } }
          : { data: { data: [{ id: "p1", selling_price: 100 }], store: { currency: "NGN", online_payment_available: true } } },
      ),
    );

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(useCartStore.getState().carts.shop).toEqual([item("p1"), { ...service("svc-kept"), price: 25000 }]);
    expect(result.current.onlinePaymentAvailable).toBe(true);
  });

  it("asks for products and services at the same time", async () => {
    act(() => useCartStore.setState({ carts: { shop: [item("p1"), { ...item("svc"), kind: "service" as const }] } }));
    getMock.mockReturnValue(new Promise(() => {}));

    renderHook(() => useCartRepricing("shop"));

    await waitFor(() => expect(getMock.mock.calls.map(([url]) => url)).toEqual(["/storefront/shop/products", "/storefront/shop/services"]));
  });

  it("still confirms product prices, and keeps the booking as it was, when only the services lookup fails", async () => {
    const booking = { ...item("svc", 900), kind: "service" as const };
    act(() => useCartStore.setState({ carts: { shop: [item("p1", 100), booking] } }));
    getMock.mockImplementation((url: string) =>
      url.endsWith("/services")
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ data: { data: [{ id: "p1", selling_price: 120 }], store: {} } }),
    );

    const { result } = renderHook(() => useCartRepricing("shop"));
    await waitFor(() => expect(result.current.pricesLoading).toBe(false));

    expect(result.current.pricesStale).toBe(false);
    expect(useCartStore.getState().carts.shop).toEqual([{ ...item("p1"), price: 120 }, booking]);
  });
});
