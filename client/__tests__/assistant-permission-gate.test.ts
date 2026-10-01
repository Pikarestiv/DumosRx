import { describe, it, expect } from "vitest";
import { authorizeToolCall } from "@/lib/assistant/permission-gate";
import type { AssistantTool, ToolContext } from "@/lib/assistant/types";

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    user: { id: "u1", role: "sales_staff" },
    permissionGroup: { permissions: [] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k) => k,
    now: new Date(2026, 8, 29),
    ...overrides,
  };
}

const gatedTool: AssistantTool = {
  name: "profit_summary",
  description: "d",
  parameters: {},
  requiredPermission: "view_financial_reports",
  examples: [],
  execute: async () => ({}),
  format: () => ({ kind: "answer", text: "" }),
};

const openTool: AssistantTool = {
  name: "product_stock",
  description: "d",
  parameters: {},
  examples: [],
  execute: async () => ({}),
  format: () => ({ kind: "answer", text: "" }),
};

describe("authorizeToolCall", () => {
  it("allows a tool with no requiredPermission for any signed-in user", () => {
    expect(authorizeToolCall(openTool, makeCtx())).toEqual({ ok: true });
  });

  it("denies a gated tool when the user's group lacks the permission", () => {
    const result = authorizeToolCall(gatedTool, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("allows a gated tool when the user's group has the permission", () => {
    const ctx = makeCtx({ permissionGroup: { permissions: ["view_financial_reports"] } });
    expect(authorizeToolCall(gatedTool, ctx)).toEqual({ ok: true });
  });

  it("denies any tool call when there is no signed-in user", () => {
    const ctx = makeCtx({ user: null });
    const result = authorizeToolCall(openTool, ctx);
    expect(result.ok).toBe(false);
  });
});
