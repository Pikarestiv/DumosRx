"use client";

import { StockAudits } from "./stock-audits";
import { useInventoryAudit } from "@/lib/context/inventory-audit-context";

// Rendered once at the /inventory layout level (see inventory-audit-context.tsx for why) so the overlay survives the [tab]…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-inventory-audit-overlay-tsx-L6
export function InventoryAuditOverlay() {
  const { isAuditing, setIsAuditing } = useInventoryAudit();

  if (!isAuditing) return null;

  return <StockAudits onClose={() => setIsAuditing(false)} />;
}
