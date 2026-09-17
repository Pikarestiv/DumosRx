import { describe, it, expect } from "vitest";
import { hasMultiStoreAccess } from "@/lib/hooks/use-feature-gate";

/**
 * multi_store used to be a separately admin-configured boolean, independent
 * of the `stores` numeric limit — which let them disagree (Pro sold 3
 * stores while multi_store stayed false). Deriving it from the limit
 * instead removes that whole class of drift: a store limit of 1 can never
 * mean "multi-store," and anything above 1 always does.
 */
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
