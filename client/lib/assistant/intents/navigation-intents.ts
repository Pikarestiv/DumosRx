import type { IntentDefinition } from "../types";
import { HELP_TOPICS } from "../help-catalog";

export const NAVIGATION_INTENTS: IntentDefinition[] = HELP_TOPICS.map((topic) => ({
  id: `navigate_${topic.id}`,
  tool: "navigate_help",
  label: topic.title,
  phrases: topic.phrases,
  keywords: topic.keywords,
  buildArgs: () => ({ topic: topic.id }),
}));
