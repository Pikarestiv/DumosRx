import { hasPermission } from "@/lib/hooks/use-permissions";
import type { AssistantTool, ToolContext } from "./types";

export type Authorization = { ok: true } | { ok: false; reason: string };

export function authorizeToolCall(tool: AssistantTool, ctx: ToolContext): Authorization {
  if (!ctx.user) {
    return { ok: false, reason: "You need to be signed in to do that." };
  }

  if (!tool.requiredPermission) {
    return { ok: true };
  }

  const allowed = hasPermission(ctx.user, ctx.permissionGroup, tool.requiredPermission, "any");
  if (!allowed) {
    return { ok: false, reason: "You don't have permission to see that." };
  }

  return { ok: true };
}
