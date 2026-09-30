import type { AssistantTool } from "../types";
import { navigateHelpTool } from "./navigation-tools";
import { productStockTool } from "./inventory-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map<string, AssistantTool>([
  [navigateHelpTool.name, navigateHelpTool as unknown as AssistantTool],
  [productStockTool.name, productStockTool as unknown as AssistantTool],
]);
