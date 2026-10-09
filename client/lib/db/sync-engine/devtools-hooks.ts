import { forceFullResync, reconcileStockQuantities } from "./index";
import {
  verifyStockIntegrity,
  foldStockQuantities,
} from "./stock-integrity";

/**
 * Support tools for a DevTools session, deliberately not in-app buttons.
 * Extracted from index.ts to keep it under the 350-line limit (AGENTS.md §4).
 */
if (typeof window !== "undefined") {
  window.__forceFullResync = forceFullResync;
  window.__reconcileStockQuantities = reconcileStockQuantities;
  window.__verifyStockIntegrity = verifyStockIntegrity;
  // Gated, unlike its read-only neighbour: this one writes to stock numbers,
  // so it stays inside the same support-session boundary as the UI action.
  window.__foldStockQuantities = async () => {
    const { isImpersonatedSession } = await import("@/lib/utils/impersonation");
    if (!isImpersonatedSession()) {
      throw new Error("Stock rebuild is only available in a support session.");
    }
    return foldStockQuantities();
  };
}
