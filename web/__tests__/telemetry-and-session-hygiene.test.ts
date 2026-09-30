import { describe, it, expect, beforeEach, vi } from "vitest";
import { sanitizePayload } from "@/lib/api/logger";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

vi.mock("@/lib/api/client", () => ({
  webApiClient: { request: vi.fn(async () => Promise.reject(new Error("401"))) },
}));

describe("sanitizePayload masks customer PII (A-107)", () => {
  it("masks the storefront checkout body's contact and delivery details", () => {
    const masked = sanitizePayload({
      customer_name: "Ada Lovelace",
      customer_phone: "08031234567",
      customer_address: "12 Herbert Macaulay Way, Yaba",
      customer_email: "ada@example.com",
      payment_method: "paystack",
      items: [{ id: "p1", quantity: 2 }],
    }) as Record<string, unknown>;

    for (const key of [
      "customer_name",
      "customer_phone",
      "customer_address",
      "customer_email",
    ]) {
      expect(masked[key]).toBe("********");
    }
    expect(masked.payment_method).toBe("paystack");
    expect(masked.items).toEqual([{ id: "p1", quantity: 2 }]);
  });

  it("masks bare email/phone/address keys too, and keeps masking credentials", () => {
    const masked = sanitizePayload({
      email: "ada@example.com",
      phone: "08031234567",
      address: "12 Herbert Macaulay Way",
      password: "hunter2",
      store_name: "Pikarestiv Stores",
    }) as Record<string, unknown>;

    expect(masked.email).toBe("********");
    expect(masked.phone).toBe("********");
    expect(masked.address).toBe("********");
    expect(masked.password).toBe("********");
    expect(masked.store_name).toBe("Pikarestiv Stores");
  });

  it("masks nested customer details without dropping the payload shape", () => {
    const masked = sanitizePayload({
      requestData: { customer_email: "ada@example.com", slug: "pikarestiv" },
    }) as Record<string, Record<string, unknown>>;

    expect(masked.requestData.customer_email).toBe("********");
    expect(masked.requestData.slug).toBe("pikarestiv");
  });
});

describe("admin summary cache is cleared when a session ends (A-100)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initSession's failure path wipes the persisted platform summary", async () => {
    useAdminStore.setState({
      summary: { stats: [] } as never,
      lastFetched: Date.now(),
    });
    localStorage.setItem("admin-storage", JSON.stringify({ state: {} }));

    await useAdminAuthStore.getState().initSession();

    expect(useAdminStore.getState().summary).toBeNull();
    expect(localStorage.getItem("admin-storage")).toBeNull();
    expect(useAdminAuthStore.getState().sessionVerified).toBe(false);
  });
});
