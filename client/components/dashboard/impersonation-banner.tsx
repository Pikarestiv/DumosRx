"use client";

import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { WEB_APP_URL } from "@/lib/constants";
import { useHydrated } from "@/lib/hooks/use-hydrated";

import {
  IMPERSONATED_USER_STORAGE_KEY as IMPERSONATED_USER_KEY,
  IMPERSONATOR_RETURN_CODE_KEY as RETURN_CODE_KEY,
} from "@/lib/utils/impersonation";

export function ImpersonationBanner() {
  const hydrated = useHydrated();
  const isImpersonating = hydrated && !!localStorage.getItem(RETURN_CODE_KEY);

  if (!isImpersonating) return null;

  const handleEndImpersonation = () => {
    // Previously redeemed the stored return-hop code (a one-time, 60-SECOND-lived handoff code minted back when impersonation…
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-impersonation-banner-tsx-L24
    localStorage.removeItem(RETURN_CODE_KEY);
    localStorage.removeItem(IMPERSONATED_USER_KEY);
    apiClient.clearToken();
    window.location.href = WEB_APP_URL + "/admin";
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-primary/10 border-b border-primary/20">
      <div className="flex items-center justify-center gap-3 px-4 py-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <span className="text-xs font-black text-primary uppercase tracking-tighter">
          Impersonation Mode
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-[10px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 rounded-lg flex items-center gap-2"
          onClick={handleEndImpersonation}
        >
          <LogOut className="h-3 w-3" />
          End Session
        </Button>
      </div>
    </div>
  );
}
