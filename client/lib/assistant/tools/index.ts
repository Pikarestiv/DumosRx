import type { AssistantTool } from "../types";
import { navigateHelpTool } from "./navigation-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map<string, AssistantTool>([
  [navigateHelpTool.name, navigateHelpTool as unknown as AssistantTool],
]);
