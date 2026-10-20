import { describe, it, expect } from "vitest";
import { hasMultiStoreAccess } from "@/lib/hooks/use-feature-gate";

// multi_store used to be a separately admin-configured boolean, independent of the `stores` numeric limit — which let them…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-has-multi-store-access-test-ts-L4
describe("hasMultiStoreAccess", () => {
  it("is false at the single-store limit", () => {
    expect(hasMultiStoreAccess(1)).toBe(false);
  });

  it("is true once the limit allows more than one store", () => {
    expect(hasMultiStoreAccess(3)).toBe(true);
  });

  it("is true for an effectively unlimited (Infinity) limit", () => {
    expect(hasMultiStoreAccess(Infinity)).toBe(true);
  });
});
