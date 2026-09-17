"use client";

import { createContext, useContext, useState } from "react";

interface InventoryAuditContextType {
  isAuditing: boolean;
  setIsAuditing: (value: boolean) => void;
}

const InventoryAuditContext = createContext<InventoryAuditContextType | undefined>(undefined);

/** Instantiated in app/(dashboard)/layout.tsx, wrapping DashboardLayout from
 * the outside. DashboardLayout keys its page-content wrapper on `pathname`
 * (see dashboard-layout.tsx) to retrigger the route-transition animation on
 * every navigation, which force-remounts everything below it on every
 * navigation - including the "/inventory/audits" -> router.replace
 * ("/inventory/overview") bounce in useStockBatchManagement. State living
 * anywhere below that boundary gets wiped before the audit overlay ever got
 * a chance to stay open, so this context (and the overlay it drives) must
 * live above it instead. */
export function InventoryAuditProvider({ children }: { children: React.ReactNode }) {
  const [isAuditing, setIsAuditing] = useState(false);

  return (
    <InventoryAuditContext.Provider value={{ isAuditing, setIsAuditing }}>
      {children}
    </InventoryAuditContext.Provider>
  );
}

export const useInventoryAudit = () => {
  const context = useContext(InventoryAuditContext);
  if (context === undefined) {
    throw new Error("useInventoryAudit must be used within an InventoryAuditProvider");
  }
  return context;
};
