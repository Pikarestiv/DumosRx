"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";
import { useAdminAuthStore, type User } from "@/lib/store/use-admin-auth-store";

/**
 * The code arrives in the URL fragment (`#code=...`), not the query string:
 * a fragment is never sent to this host's server, so it stays out of access
 * logs and out of any Referer header for the 60s it remains redeemable. See
 * client/app/auth/callback/page.tsx's readHandoffCodes() for the matching
 * outbound leg.
 */
function readHandoffCode(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");
}

function HandoffHandler() {
  const router = useRouter();
  // Starts null rather than probing for the code here: the fragment is only
  // readable on the client, so deriving initial state from it would render
  // "Missing handoff code" during prerender and mismatch on hydration. The
  // effect below sets it instead.
  const [error, setError] = useState<string | null>(null);

  // Guards against React Strict Mode's dev-only double-invoke of mount
  // effects: without this, a second run reads the code this same effect
  // already stripped from the URL on the first run below, and renders
  // "Missing handoff code" over top of a login that already succeeded in
  // the background (see the effect's own comment on why stripping the URL
  // can't just be moved out of here instead).
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = readHandoffCode();
    window.history.replaceState({}, "", window.location.pathname);

    if (!code) {
      setError("Missing handoff code.");
      return;
    }

    void (async () => {
      try {
        const { token, user } = await webApiClient.consumeHandoffCode(code);
        useAdminAuthStore.getState().setToken(token);
        useAdminAuthStore.getState().setUser(user as unknown as User);
        toast.success("Session Restored", { description: "Back to Admin Dashboard" });
        router.replace("/admin/stores/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore admin session.");
      }
    })();
    // Intentionally run once on mount only. Next.js patches window.history
    // to keep its router state in sync, so the replaceState() call above
    // produces a new `searchParams` object on the next render. If that's a
    // dependency here, the effect re-fires with the now-stripped (empty)
    // code and can loop / clobber the real result before it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center px-4">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-semibold">{error}</p>
        <p className="text-sm text-muted-foreground">
          Please sign in to the admin dashboard again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AdminHandoffPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <HandoffHandler />
    </Suspense>
  );
}
