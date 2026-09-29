import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettingsForm } from "@/hooks/use-settings-form";
import type { StoreProfile } from "@/lib/context/store-context";

/**
 * Regression coverage for FIXED_BUGS.md A-31: enabled_payment_methods is
 * stored as TEXT holding JSON, not a real array column, so a malformed or
 * double-encoded value (the same shape that crashed the admin panel's Store
 * Details page - see A-29) must fall back to the default list instead of
 * throwing during the initial render or the storeProfile sync effect.
 */
function baseProfile(overrides: Partial<StoreProfile> = {}): StoreProfile {
  return {
    id: "s1",
    name: "Test Store",
    store_type: "pharmacy",
    is_initialized: 1,
    currency: "NGN",
    vat_percentage: 7.5,
    theme: "default",
    ...overrides,
  };
}

describe("useSettingsForm enabled_payment_methods parsing", () => {
  it("falls back to the default list when the value is malformed JSON", () => {
    const profile = baseProfile({ enabled_payment_methods: "not json" });

    const { result } = renderHook(() => useSettingsForm(profile, 15));

    expect(result.current.enabledPaymentMethods).toEqual([
      "cash",
      "card",
      "transfer",
      "credit",
      "mixed",
    ]);
  });

  it("falls back to the default list when the value is a double-encoded JSON string", () => {
    // The exact shape that crashed A-29: json_encode() applied twice yields
    // a JSON string whose decoded value is itself a string, not an array.
    const profile = baseProfile({
      enabled_payment_methods: JSON.stringify(JSON.stringify(["cash", "card"])),
    });

    const { result } = renderHook(() => useSettingsForm(profile, 15));

    expect(result.current.enabledPaymentMethods).toEqual([
      "cash",
      "card",
      "transfer",
      "credit",
      "mixed",
    ]);
  });

  it("parses a well-formed value normally", () => {
    const profile = baseProfile({
      enabled_payment_methods: JSON.stringify(["cash", "card"]),
    });

    const { result } = renderHook(() => useSettingsForm(profile, 15));

    expect(result.current.enabledPaymentMethods).toEqual(["cash", "card"]);
  });

  it("falls back to the default list when storeProfile has no value at all", () => {
    const profile = baseProfile();

    const { result } = renderHook(() => useSettingsForm(profile, 15));

    expect(result.current.enabledPaymentMethods).toEqual([
      "cash",
      "card",
      "transfer",
      "credit",
      "mixed",
    ]);
  });
});
