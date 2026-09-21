"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/context/auth-context";

/**
 * The codes arrive in the URL fragment (`#code=...&return_code=...`), not
 * the query string: a fragment is never sent to this host's server, so the
 * codes stay out of access logs and out of any Referer header for the 60s
 * they remain redeemable. `searchParams` is therefore not where to look.
 */
function readHandoffCodes(): { code: string | null; returnCode: string | null } {
  if (typeof window === "undefined") return { code: null, returnCode: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { code: hash.get("code"), returnCode: hash.get("return_code") };
}

function CallbackHandler() {
  const router = useRouter();
  const { loginFromHandoff } = useAuth();
  // Starts null rather than probing for the code here: the fragment is only
  // readable on the client, so deriving initial state from it would render
  // "Missing handoff code" during prerender and mismatch on hydration. The
  // effect below sets it instead.
  const [error, setError] = useState<string | null>(null);

  // Guards against React Strict Mode's dev-only double-invoke of mount
  // effects: without this, a second run reads the code/return_code this
  // same effect already stripped from the URL on the first run below, and
  // renders "Missing handoff code" over top of a login that already
  // succeeded in the background (see the effect's own comment on why
  // stripping the URL can't just be moved out of here instead).
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const { code, returnCode } = readHandoffCodes();

    // Strip the codes from the visible URL/history immediately, before the
    // exchange network call, so they don't linger in browser history or get
    // sent as a Referer header to any resource this page happens to load.
    window.history.replaceState({}, "", window.location.pathname);

    if (!code) {
      setError("Missing handoff code.");
      return;
    }

    void (async () => {
      try {
        const { token, user } = await apiClient.consumeHandoffCode(code);
        // Token first: downstream code/interceptors expect it to be in place
        // before any other session state is set.
        apiClient.setToken(token);
        // /dashboard is gated on the local auth context's `user` (see
        // DashboardLayout), which normally only PIN login populates. Without
        // this the arriving (impersonated) user would be bounced to /login.
        loginFromHandoff(user);

        if (returnCode) {
          localStorage.setItem("impersonator_handoff_return_code", returnCode);
        }

        router.replace("/dashboard");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete sign-in.");
      }
    })();
    // Intentionally run once on mount only. The replaceState() call above
    // strips the fragment, so a re-fire would read an empty code and could
    // loop / clobber the real result before it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center px-4">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-semibold">{error}</p>
        <p className="text-sm text-muted-foreground">
          The link may have expired. Please try again from where you came from.
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

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
