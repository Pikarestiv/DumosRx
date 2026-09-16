"use client";

import { StockAudits } from "./stock-audits";
import { useInventoryAudit } from "@/lib/context/inventory-audit-context";

/** Rendered once at the /inventory layout level (see inventory-audit-context.tsx
 * for why) so the overlay survives the [tab] page remount that "Start Audit"
 * triggers. */
export function InventoryAuditOverlay() {
  const { isAuditing, setIsAuditing } = useInventoryAudit();

  if (!isAuditing) return null;

  return <StockAudits onClose={() => setIsAuditing(false)} />;
}
