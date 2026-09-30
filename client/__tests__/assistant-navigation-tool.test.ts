import { describe, it, expect } from "vitest";
import { navigateHelpTool } from "@/lib/assistant/tools/navigation-tools";
import { HELP_TOPICS } from "@/lib/assistant/help-catalog";
import type { ToolContext } from "@/lib/assistant/types";

const ctx: ToolContext = {
  user: { id: "u1", role: "store_owner" },
  permissionGroup: { permissions: [] },
  currencyCode: "NGN",
  expiryWarningDays: 90,
  storeType: "pharmacy",
  t: (k) => k,
  now: new Date(2026, 8, 29),
};

describe("navigateHelpTool", () => {
  it("finds the make_sale topic and returns its href", async () => {
    const topic = HELP_TOPICS.find((t) => t.id === "make_sale")!;
    const result = await navigateHelpTool.execute({ topic: "make_sale" }, ctx);
    const reply = navigateHelpTool.format(result, { topic: "make_sale" }, ctx);
    expect(reply.kind).toBe("help");
    expect(reply.actions?.[0]).toEqual({ label: topic.title, href: topic.href });
  });

  it("omits the link and explains when the user lacks the topic's required permission", async () => {
    const cashierCtx: ToolContext = { ...ctx, user: { id: "u2", role: "sales_staff" }, permissionGroup: { permissions: [] } };
    const result = await navigateHelpTool.execute({ topic: "add_staff" }, cashierCtx);
    const reply = navigateHelpTool.format(result, { topic: "add_staff" }, cashierCtx);
    expect(reply.actions ?? []).toHaveLength(0);
    expect(reply.text).toMatch(/permission/i);
  });

  it("returns null for an unknown topic id", async () => {
    const result = await navigateHelpTool.execute({ topic: "not_a_real_topic" }, ctx);
    expect(result).toBeNull();
    const reply = navigateHelpTool.format(result, { topic: "not_a_real_topic" }, ctx);
    expect(reply.kind).toBe("fallback");
  });
});

describe("NAVIGATION_INTENTS phrase matching (regression: derived-from-keyword phrases used to miss real phrasings)", () => {
  it("resolves realistic utterances to the intended topic via the real matcher", async () => {
    const { matchIntent } = await import("@/lib/assistant/intent-matcher");
    const { normalizeUtterance } = await import("@/lib/assistant/normalize");
    const { NAVIGATION_INTENTS } = await import("@/lib/assistant/intents/navigation-intents");

    const cases: [string, string][] = [
      ["how do i make a sale", "navigate_make_sale"],
      ["how do i add a product", "navigate_add_product"],
      ["where do i add staff", "navigate_add_staff"],
      ["how do i record an expense", "navigate_record_expense"],
    ];

    for (const [utterance, expectedId] of cases) {
      const { normalized } = normalizeUtterance(utterance);
      const result = matchIntent(normalized, NAVIGATION_INTENTS);
      expect(result.kind).toBe("match");
      if (result.kind === "match") expect(result.intent.id).toBe(expectedId);
    }
  });
});
