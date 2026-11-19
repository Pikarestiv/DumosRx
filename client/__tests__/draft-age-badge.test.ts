import { describe, it, expect } from "vitest";
import { draftAge } from "@/components/procurement/draft-age-badge";

const now = new Date("2026-11-19T12:00:00Z");
const order = (overrides: Record<string, string | undefined>) => ({ status: "pending", created_at: "2026-11-19T08:00:00Z", updated_at: undefined, ...overrides });

describe("draftAge", () => {
  it("counts days since the draft was last touched, not since it was created", () => {
    expect(draftAge(order({ created_at: "2026-10-01T08:00:00Z", updated_at: "2026-11-17T08:00:00Z" }), now)).toEqual({ label: "2 days old", stale: false });
    expect(draftAge(order({}), now)).toEqual({ label: "Edited today", stale: false });
    expect(draftAge(order({ created_at: "2026-11-18T08:00:00Z" }), now)?.label).toBe("1 day old");
  });

  it("nudges only once a draft has sat for 30 days, and never deletes it", () => {
    expect(draftAge(order({ created_at: "2026-10-21T08:00:00Z" }), now)?.stale).toBe(false);
    expect(draftAge(order({ created_at: "2026-10-20T08:00:00Z" }), now)).toEqual({ label: "Untouched 30 days: receive, send or delete it", stale: true });
  });

  it("says nothing for orders that are no longer drafts", () => {
    expect(draftAge(order({ status: "sent" }), now)).toBeNull();
  });
});
