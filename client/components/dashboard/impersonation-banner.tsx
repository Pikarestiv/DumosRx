"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { WEB_APP_URL } from "@/lib/constants";

import {
  IMPERSONATED_USER_STORAGE_KEY as IMPERSONATED_USER_KEY,
  IMPERSONATOR_RETURN_CODE_KEY as RETURN_CODE_KEY,
} from "@/lib/utils/impersonation";

export function ImpersonationBanner() {
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    setIsImpersonating(!!localStorage.getItem(RETURN_CODE_KEY));
  }, []);

  if (!isImpersonating) return null;

  const handleEndImpersonation = () => {
    // Previously redeemed the stored return-hop code (a one-time,
    // 60-SECOND-lived handoff code minted back when impersonation
    // *started*) via consumeHandoffCode/createHandoffCode. That's the
    // expected outcome of any normal-length impersonation session, not an
    // edge case — every admin who spent more than a minute here hit the
    // catch branch below and got bounced to a fresh /admin/login instead
    // of back to their own session. No fresh code can be minted at click
    // time either, since nothing on this side holds a live admin
    // credential to mint one from.
    //
    // The actual fix: the admin's own dumosrx.com session was never
    // disturbed by impersonating in the first place (impersonateStore()
    // no longer touches drx_admin_session at all — see
    // docs/FIXED_BUGS.md) and lives entirely in that independent,
    // HttpOnly, 24h refresh cookie on the web/ origin. Navigating straight
    // to /admin lets its own layout (see app/admin/layout.tsx's
    // initSession() effect) silently re-establish the session from that
    // cookie — no handoff code, no TTL, no redemption round-trip needed.
    // This only fails if the admin's own cookie has itself expired (a
    // realistic 24h-plus session), which is a much rarer case than "spent
    // more than a minute looking around," and lands on the ordinary
    // /admin/login flow rather than a confusing dead end.
    localStorage.removeItem(RETURN_CODE_KEY);
    localStorage.removeItem(IMPERSONATED_USER_KEY);
    apiClient.clearToken();
    window.location.href = `${WEB_APP_URL}/admin`;
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
