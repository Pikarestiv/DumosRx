import { hasPermission } from "@/lib/hooks/use-permissions";
import { HELP_TOPICS } from "./help-catalog";
import { NAVIGATE_HELP_TOOL_NAME, helpTopicExample } from "./tools/navigation-tools";
import type { AssistantTool, ToolContext } from "./types";

function firstPermittedHelpExample(ctx: ToolContext): string | undefined {
  const topic = HELP_TOPICS.find(
    (candidate) =>
      !candidate.requiredPermission ||
      hasPermission(ctx.user, ctx.permissionGroup, candidate.requiredPermission, "any"),
  );
  return topic ? helpTopicExample(topic) : undefined;
}

type SuggestableTool = Pick<AssistantTool, "name" | "examples">;

export function suggestionExampleFor(tool: SuggestableTool, ctx: ToolContext): string | undefined {
  if (tool.name === NAVIGATE_HELP_TOOL_NAME) return firstPermittedHelpExample(ctx);
  return tool.examples[0];
}
