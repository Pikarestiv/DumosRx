import type { IntentDefinition } from "../types";
import { NAVIGATION_INTENTS } from "./navigation-intents";
import { INVENTORY_INTENTS } from "./inventory-intents";

export const INTENTS: IntentDefinition[] = [...NAVIGATION_INTENTS, ...INVENTORY_INTENTS];
