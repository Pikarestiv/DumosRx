import type { AssistantTool } from "../types";
import { navigateHelpTool } from "./navigation-tools";
import { productStockTool, inventoryStatusTool } from "./inventory-tools";
import { mySalesTodayTool } from "./sales-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map<string, AssistantTool>([
  [navigateHelpTool.name, navigateHelpTool as unknown as AssistantTool],
  [productStockTool.name, productStockTool as unknown as AssistantTool],
  [inventoryStatusTool.name, inventoryStatusTool as unknown as AssistantTool],
  [mySalesTodayTool.name, mySalesTodayTool as unknown as AssistantTool],
]);
