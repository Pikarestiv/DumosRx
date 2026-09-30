import { describe, it, expect, vi } from "vitest";
import { answer } from "@/lib/assistant/router";
import type { AssistantBrain, AssistantTool, ToolContext } from "@/lib/assistant/types";

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: ["some_permission"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k) => k,
    now: new Date(2026, 8, 29),
    ...overrides,
  };
}

function brainThatCalls(tool: string, args: Record<string, unknown> = {}): AssistantBrain {
  return { resolve: () => ({ kind: "call", call: { tool, args } }) };
}

function brainWith(outcome: ReturnType<AssistantBrain["resolve"]>): AssistantBrain {
  return { resolve: () => outcome };
}

vi.mock("@/lib/assistant/tools", () => {
  const okTool: AssistantTool = {
    name: "ok_tool",
    description: "d",
    parameters: {},
    examples: ["ok"],
    execute: async () => ({ value: 1 }),
    format: (result) => ({ kind: "answer", text: `value is ${(result as { value: number }).value}` }),
  };

  const throwingTool: AssistantTool = {
    name: "throwing_tool",
    description: "d",
    parameters: {},
    examples: ["throw"],
    execute: async () => {
      throw new Error("boom");
    },
    format: () => ({ kind: "answer", text: "unreachable" }),
  };

  const deniedTool: AssistantTool = {
    name: "denied_tool",
    description: "d",
    parameters: {},
    requiredPermission: "nope_permission",
    examples: ["denied"],
    execute: async () => ({}),
    format: () => ({ kind: "answer", text: "unreachable" }),
  };

  const deniedReroutableTool: AssistantTool = {
    name: "denied_reroutable_tool",
    description: "d",
    parameters: {},
    requiredPermission: "view_reports",
    examples: ["denied reroutable"],
    execute: async () => ({}),
    format: () => ({ kind: "answer", text: "unreachable" }),
  };

  const rerouteTargetTool: AssistantTool = {
    name: "reroute_target_tool",
    description: "d",
    parameters: {},
    requiredPermission: "process_sales",
    examples: ["reroute target"],
    execute: async () => ({}),
    format: () => ({ kind: "answer", text: "rerouted answer" }),
  };

  return {
    TOOL_REGISTRY: new Map([
      [okTool.name, okTool],
      [throwingTool.name, throwingTool],
      [deniedTool.name, deniedTool],
      [deniedReroutableTool.name, deniedReroutableTool],
      [rerouteTargetTool.name, rerouteTargetTool],
    ]),
  };
});

vi.mock("@/lib/assistant/router-reroutes", () => ({
  REROUTE_ON_DENIAL: { denied_reroutable_tool: "reroute_target_tool" },
}));

describe("answer", () => {
  it("returns the formatted reply for a matched, authorized tool", async () => {
    const reply = await answer("anything", makeCtx(), brainThatCalls("ok_tool"));
    expect(reply).toEqual({ kind: "answer", text: "value is 1" });
  });

  it("returns a denied reply when the tool call is not authorized and has no reroute", async () => {
    const staffCtx = makeCtx({
      user: { id: "u1", role: "sales_staff" },
      permissionGroup: { permissions: ["some_permission"] },
    });
    const reply = await answer("anything", staffCtx, brainThatCalls("denied_tool"));
    expect(reply.kind).toBe("denied");
  });

  it("reroutes sales_summary to my_sales_today when denied view_reports but permitted process_sales", async () => {
    const cashierCtx = makeCtx({
      user: { id: "u1", role: "sales_staff" },
      permissionGroup: { permissions: ["process_sales"] },
    });
    const reply = await answer("total sales today", cashierCtx, brainThatCalls("denied_reroutable_tool"));
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("rerouted");
  });

  it("notes the date mismatch instead of silently dropping it when a reroute answers a different date than requested", async () => {
    const cashierCtx = makeCtx({
      user: { id: "u1", role: "sales_staff" },
      permissionGroup: { permissions: ["process_sales"] },
      now: new Date(2026, 8, 29),
    });
    const reply = await answer(
      "total sales yesterday",
      cashierCtx,
      brainThatCalls("denied_reroutable_tool", { date: "2026-09-28" }),
    );
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("2026-09-28");
    expect(reply.text).toMatch(/today/i);
  });

  it("returns an error reply, not a throw, when the tool execute() throws", async () => {
    const reply = await answer("anything", makeCtx(), brainThatCalls("throwing_tool"));
    expect(reply.kind).toBe("error");
  });

  it("returns a fallback reply when the brain finds no match", async () => {
    const reply = await answer("gibberish", makeCtx(), brainWith({ kind: "none" }));
    expect(reply.kind).toBe("fallback");
  });

  it("returns an ambiguous-style fallback naming the candidates by label, not tool name", async () => {
    const reply = await answer(
      "ambiguous input",
      makeCtx(),
      brainWith({
        kind: "ambiguous",
        candidates: [
          { tool: "ok_tool", label: "Check today's number" },
          { tool: "throwing_tool", label: "Check the other number" },
        ],
      }),
    );
    expect(reply.kind).toBe("fallback");
    expect(reply.text).toContain("Check today's number");
    expect(reply.text).toContain("Check the other number");
  });
});
