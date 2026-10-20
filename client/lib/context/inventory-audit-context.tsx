"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface InventoryAuditContextType {
  isAuditing: boolean;
  setIsAuditing: (value: boolean) => void;
}

const InventoryAuditContext = createContext<InventoryAuditContextType | undefined>(undefined);

// Instantiated in app/(dashboard)/layout.tsx, wrapping DashboardLayout from the outside.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#context-inventory-audit-context-tsx-L12
export function InventoryAuditProvider({ children }: { children: React.ReactNode }) {
  const [isAuditing, setIsAuditing] = useState(false);
  const value = useMemo(() => ({ isAuditing, setIsAuditing }), [isAuditing]);

  return (
    <InventoryAuditContext.Provider value={value}>
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
