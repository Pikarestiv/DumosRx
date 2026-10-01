import type { IntentDefinition } from "../types";
import { NAVIGATION_INTENTS } from "./navigation-intents";
import { INVENTORY_INTENTS } from "./inventory-intents";
import { SALES_INTENTS } from "./sales-intents";
import { FINANCE_INTENTS } from "./finance-intents";

export const INTENTS: IntentDefinition[] = [...NAVIGATION_INTENTS, ...INVENTORY_INTENTS, ...SALES_INTENTS, ...FINANCE_INTENTS];
