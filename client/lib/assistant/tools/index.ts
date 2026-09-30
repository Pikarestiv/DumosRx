import type { AssistantTool } from "../types";
import { navigateHelpTool } from "./navigation-tools";
import { productStockTool, inventoryStatusTool } from "./inventory-tools";
import { mySalesTodayTool, salesSummaryTool } from "./sales-tools";
import { profitSummaryTool } from "./finance-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map<string, AssistantTool>([
  [navigateHelpTool.name, navigateHelpTool as unknown as AssistantTool],
  [productStockTool.name, productStockTool as unknown as AssistantTool],
  [inventoryStatusTool.name, inventoryStatusTool as unknown as AssistantTool],
  [mySalesTodayTool.name, mySalesTodayTool as unknown as AssistantTool],
  [salesSummaryTool.name, salesSummaryTool as unknown as AssistantTool],
  [profitSummaryTool.name, profitSummaryTool as unknown as AssistantTool],
]);
