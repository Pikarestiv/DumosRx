"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { WEB_APP_URL } from "@/lib/constants";

const RETURN_CODE_KEY = "impersonator_handoff_return_code";

export function ImpersonationBanner() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    setIsImpersonating(!!localStorage.getItem(RETURN_CODE_KEY));
  }, []);

  if (!isImpersonating) return null;

  const handleEndImpersonation = async () => {
    const returnCode = localStorage.getItem(RETURN_CODE_KEY);
    if (!returnCode) return;

    setEnding(true);
    try {
      // The stored value from the original handoff is itself a one-time
      // code (see client/app/auth/callback/page.tsx) — redeem it now to get
      // the admin's real token back, then immediately re-wrap it in a fresh
      // code for the trip back to dumosrx.com. Two hops, but neither origin
      // ever sees the other's raw token, and each code is single-use.
      const { token: adminToken } = await apiClient.consumeHandoffCode(returnCode);
      const { code } = await apiClient.createHandoffCode(adminToken);

      localStorage.removeItem(RETURN_CODE_KEY);
      apiClient.clearToken();

      window.location.href = `${WEB_APP_URL}/admin/handoff?code=${code}`;
    } catch (_error) {
      toast.error("Failed to return to admin session");
      setEnding(false);
    }
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
          disabled={ending}
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
