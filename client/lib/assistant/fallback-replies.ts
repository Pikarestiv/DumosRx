import type { AssistantReply, ToolContext } from "./types";
import { TOOL_REGISTRY } from "./tools";
import { authorizeToolCall } from "./permission-gate";

function permittedExamples(ctx: ToolContext, limit: number): string[] {
  const examples: string[] = [];
  for (const tool of TOOL_REGISTRY.values()) {
    if (authorizeToolCall(tool, ctx).ok) {
      examples.push(...tool.examples.slice(0, 1));
    }
    if (examples.length >= limit) break;
  }
  return examples.slice(0, limit);
}

export function buildNoMatchReply(ctx: ToolContext): AssistantReply {
  const examples = permittedExamples(ctx, 5);
  const suggestionText = examples.length > 0 ? ` Try one of these:\n${examples.join("\n")}` : "";
  return { kind: "fallback", text: `I didn't catch that.${suggestionText}` };
}

export function buildAmbiguousReply(candidateLabels: string[]): AssistantReply {
  return { kind: "fallback", text: `Did you mean: ${candidateLabels.join(" or ")}?` };
}

export function buildDeniedReply(reason: string): AssistantReply {
  return { kind: "denied", text: reason };
}

export function buildErrorReply(): AssistantReply {
  return { kind: "error", text: "Something went wrong answering that. Please try again." };
}
