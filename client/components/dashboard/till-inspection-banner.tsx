"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTillInspectionSession,
  endTillInspectionSession,
  extendTillInspectionSession,
  msUntilInspectionExpiry,
  IDLE_WARNING_MS,
} from "@/lib/utils/till-inspection";
import {
  endAdminTillSession,
  beaconAdminTillSessionEnd,
  type TillSessionEndReason,
} from "@/lib/api/admin-till-session";
import { useStore } from "@/lib/context/store-context";

const EXTEND_THROTTLE_MS = 30_000;

function hardCapReached(session: { hardExpiresAt: string } | null): boolean {
  return !!session && new Date(session.hardExpiresAt).getTime() <= Date.now();
}

/**
 * Always on screen for the whole inspection session, so staff can never be
 * unaware that someone else is looking at their till. Also owns the idle
 * lifecycle, being the one component guaranteed to be mounted throughout.
 */
export function TillInspectionBanner() {
  const { storeProfile } = useStore();
  const [session, setSession] = useState<ReturnType<typeof getTillInspectionSession>>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const closing = useRef(false);

  // Uses the id captured at mount, not a fresh read: on the idle path the
  // session has already expired, so re-reading storage returns null and the
  // server would never receive the exit — leaving an audit entry with no exit
  // and no duration.
  const close = useCallback(
    async (reason: TillSessionEndReason) => {
      // Guarded: the 1s interval keeps firing while the POST is in flight, so
      // without this the idle path called end repeatedly and wrote duplicate
      // exit rows to the audit log.
      if (closing.current) return;
      closing.current = true;

      const sessionId = session?.sessionId ?? getTillInspectionSession()?.sessionId;
      if (sessionId) await endAdminTillSession(sessionId, reason);
      endTillInspectionSession();
      window.location.href = "/login";
    },
    [session],
  );

  // Read after mount, never during render: a render-time sessionStorage read
  // disagrees with the prerender pass and React reports a hydration mismatch.
  useEffect(() => {
    setSession(getTillInspectionSession());
  }, []);

  useEffect(() => {
    let lastExtend = Date.now();

    const onActivity = () => {
      if (Date.now() - lastExtend < EXTEND_THROTTLE_MS) return;
      lastExtend = Date.now();
      extendTillInspectionSession();
    };

    // pagehide, not unload: an awaited fetch is cancelled with the page, so
    // closing the app — the commonest exit on a desktop till — otherwise left
    // the session row open with no exit and no duration.
    const onPageHide = () => {
      const current = getTillInspectionSession();
      if (current && !closing.current) beaconAdminTillSessionEnd(current.sessionId);
    };

    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("pagehide", onPageHide);

    const timer = setInterval(() => {
      const left = msUntilInspectionExpiry();
      if (left === null || left <= 0) {
        clearInterval(timer);
        // Which deadline won decides the reason, so the audit log can tell an
        // abandoned till from one that simply ran out its four hours.
        void close(hardCapReached(session) ? "expired" : "idle");
        return;
      }
      setRemainingMs(left <= IDLE_WARNING_MS ? left : null);
    }, 1000);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(timer);
    };
  }, [close]);

  if (!session) return null;

  const warning = remainingMs !== null;
  const seconds = warning ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 border-b ${
        warning
          ? "bg-destructive/10 border-destructive/30"
          : "bg-primary/10 border-primary/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-2">
        <ShieldAlert
          className={`h-4 w-4 ${warning ? "text-destructive" : "text-primary"}`}
        />
        <span
          className={`text-xs font-black uppercase tracking-tighter ${
            warning ? "text-destructive" : "text-primary"
          }`}
        >
          Read-only admin inspection · {session.admin.email}
          {storeProfile?.name ? ` · ${storeProfile.name}` : ""}
        </span>

        {warning && (
          <>
            <span className="text-xs font-bold text-destructive">
              Ending in {seconds}s
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg"
              onClick={() => {
                extendTillInspectionSession();
                setRemainingMs(null);
              }}
            >
              Stay signed in
            </Button>
          </>
        )}

        <Button
          size="sm"
          className="h-7 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2"
          onClick={() => void close("signed_out")}
        >
          <LogOut className="h-3 w-3" />
          End Session
        </Button>
      </div>
    </div>
  );
}
