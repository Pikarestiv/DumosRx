"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/context/auth-context";
import { STORAGE_KEYS } from "@/lib/storage-keys";

// The codes arrive in the URL fragment (`#code=...&return_code=...`), not the query string:
// Rationale: docs/CLIENT_COMMENTS.md#block-app-auth-callback-page-tsx-L10
function readHandoffCodes(): { code: string | null; returnCode: string | null } {
  if (typeof window === "undefined") return { code: null, returnCode: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { code: hash.get("code"), returnCode: hash.get("return_code") };
}

function CallbackHandler() {
  const router = useRouter();
  const { loginFromHandoff } = useAuth();
  // Starts null rather than probing for the code here:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-auth-callback-page-tsx-L25
  const [error, setError] = useState<string | null>(null);

  // Guards against React Strict Mode's dev-only double-invoke of mount effects:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-auth-callback-page-tsx-L31
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const { code, returnCode } = readHandoffCodes();

    // Strip the codes from the visible URL/history immediately, before the exchange network call, so they don't linger in brow…
    // Rationale: docs/CLIENT_COMMENTS.md#line-app-auth-callback-page-tsx-L45
    window.history.replaceState({}, "", window.location.pathname);

    void (async () => {
      try {
        if (!code) throw new Error("Missing handoff code.");
        const { token, user } = await apiClient.consumeHandoffCode(code);
        // Token first: downstream code/interceptors expect it to be in place
        // before any other session state is set.
        apiClient.setToken(token);
        // /dashboard is gated on the local auth context's `user` (see DashboardLayout), which normally only PIN login populates.
        // Rationale: docs/CLIENT_COMMENTS.md#line-app-auth-callback-page-tsx-L61
        loginFromHandoff(user);

        if (returnCode) {
          localStorage.setItem(STORAGE_KEYS.impersonatorReturnCode, returnCode);
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
