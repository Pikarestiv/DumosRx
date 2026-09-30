import type { AssistantBrain, AssistantReply, AssistantTool, ToolContext } from "./types";
import { intentRouterBrain } from "./intent-router-brain";
import { authorizeToolCall } from "./permission-gate";
import { buildNoMatchReply, buildAmbiguousReply, buildDeniedReply, buildErrorReply } from "./fallback-replies";
import { REROUTE_ON_DENIAL } from "./router-reroutes";
import { toDateOnly } from "./date-phrases";
import { TOOL_REGISTRY } from "./tools";
import { devLog } from "@/lib/utils/dev-log";

async function runTool(
  tool: AssistantTool,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<AssistantReply> {
  try {
    const result = await tool.execute(args, ctx);
    return tool.format(result, args, ctx);
  } catch (error) {
    devLog("[assistant] tool execution failed:", tool.name, error);
    return buildErrorReply();
  }
}

export async function answer(
  utterance: string,
  ctx: ToolContext,
  brain: AssistantBrain = intentRouterBrain,
): Promise<AssistantReply> {
  const outcome = brain.resolve(utterance, ctx);

  if (outcome.kind === "none") {
    return buildNoMatchReply(ctx);
  }

  if (outcome.kind === "ambiguous") {
    return buildAmbiguousReply(outcome.candidates.map((candidate) => candidate.label));
  }

  const tool = TOOL_REGISTRY.get(outcome.call.tool);
  if (!tool) {
    devLog("[assistant] unknown tool resolved:", outcome.call.tool);
    return buildErrorReply();
  }

  const authorization = authorizeToolCall(tool, ctx);
  if (authorization.ok) {
    return runTool(tool, outcome.call.args, ctx);
  }

  const fallbackName = REROUTE_ON_DENIAL[tool.name];
  const fallbackTool = fallbackName ? TOOL_REGISTRY.get(fallbackName) : undefined;
  if (fallbackTool && authorizeToolCall(fallbackTool, ctx).ok) {
    const reply = await runTool(fallbackTool, {}, ctx);
    const requestedDate = typeof outcome.call.args.date === "string" ? outcome.call.args.date : undefined;
    if (requestedDate && requestedDate !== toDateOnly(ctx.now)) {
      return {
        ...reply,
        text: `${reply.text} (Note: you can only see your own sales, so this is today's, not ${requestedDate}.)`,
      };
    }
    return reply;
  }

  return buildDeniedReply(authorization.reason);
}
