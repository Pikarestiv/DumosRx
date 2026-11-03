import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const storeProfile = vi.hoisted(() => ({ currency: undefined as string | undefined }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile }) }));

import { useFormatCurrency } from "@/lib/hooks/use-format-currency";

describe("useFormatCurrency", () => {
  it("formats in the store's currency and falls back to naira when none is set", () => {
    storeProfile.currency = undefined;
    expect(renderHook(() => useFormatCurrency()).result.current(1500)).toContain("₦");

    storeProfile.currency = "XAF";
    const formatted = renderHook(() => useFormatCurrency()).result.current(1500);
    expect(formatted).not.toContain("₦");
    expect(formatted).toMatch(/1\D?500/);
  });
});
