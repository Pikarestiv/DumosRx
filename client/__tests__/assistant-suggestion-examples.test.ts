import { describe, it, expect } from "vitest";
import { suggestionExampleFor } from "@/lib/assistant/suggestion-examples";
import { buildNoMatchReply } from "@/lib/assistant/fallback-replies";
import { navigateHelpTool } from "@/lib/assistant/tools/navigation-tools";
import { profitSummaryTool } from "@/lib/assistant/tools/finance-tools";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";
import type { ToolContext } from "@/lib/assistant/types";

function ctxForRole(role: string, permissions: string[]): ToolContext {
  return {
    user: { id: "u1", role },
    permissionGroup: { permissions },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k) => k,
    now: new Date(2026, 8, 29),
  };
}

const auditorCtx = ctxForRole("auditor", DEFAULT_GROUP_PERMISSIONS.auditor);
const managerCtx = ctxForRole("manager", DEFAULT_GROUP_PERMISSIONS.manager);

describe("suggestionExampleFor", () => {
  it("does not offer 'how do i make a sale' to a role without process_sales", () => {
    expect(DEFAULT_GROUP_PERMISSIONS.auditor).not.toContain("process_sales");
    expect(suggestionExampleFor(navigateHelpTool, auditorCtx)).not.toBe("how do i make a sale");
  });

  it("offers a help example the role actually has permission for", () => {
    const example = suggestionExampleFor(navigateHelpTool, auditorCtx);
    expect(example).toBe("how do i view reports");
  });

  it("still offers the make-a-sale example to a role that has process_sales", () => {
    expect(suggestionExampleFor(navigateHelpTool, managerCtx)).toBe("how do i make a sale");
  });

  it("leaves a non-help tool's first example alone", () => {
    expect(suggestionExampleFor(profitSummaryTool, managerCtx)).toBe(profitSummaryTool.examples[0]);
  });

  it("leads profit_summary with a relative date, not a hardcoded past one", () => {
    expect(profitSummaryTool.examples[0]).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("buildNoMatchReply", () => {
  it("never suggests a question an auditor would only be refused", () => {
    const reply = buildNoMatchReply(auditorCtx);
    expect(reply.text).not.toContain("how do i make a sale");
    expect(reply.text).not.toContain("my sales today");
  });

  it("does suggest the sale question to a role that can process sales", () => {
    expect(buildNoMatchReply(managerCtx).text).toContain("how do i make a sale");
  });
});
