import { hasPermission } from "@/lib/hooks/use-permissions";
import type { AssistantTool, ReplyAction } from "../types";
import { HELP_TOPICS, type HelpTopic } from "../help-catalog";

export const navigateHelpTool: AssistantTool<{ topic: string }, HelpTopic | null> = {
  name: "navigate_help",
  description: "Explains how to do something in the app and links to the right screen.",
  parameters: { topic: { type: "string", description: "The help topic id", required: true } },
  examples: HELP_TOPICS.map((t) => `how do i ${t.title.toLowerCase()}`),
  execute: async ({ topic }) => HELP_TOPICS.find((t) => t.id === topic) ?? null,
  format: (result, _args, ctx) => {
    if (!result) {
      return { kind: "fallback", text: "I don't have help for that yet." };
    }

    const allowed = !result.requiredPermission || hasPermission(ctx.user, ctx.permissionGroup, result.requiredPermission, "any");

    if (!allowed) {
      return {
        kind: "help",
        text: `${result.title} is available, but you'll need permission from your store owner to access it.`,
      };
    }

    const actions: ReplyAction[] = result.href ? [{ label: result.title, href: result.href }] : [];
    return {
      kind: "help",
      text: `${result.title}: ${result.steps.join(" → ")}`,
      actions,
    };
  },
};
