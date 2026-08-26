"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/context/auth-context";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginFromHandoff } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const returnCode = searchParams.get("return_code");

    // Strip the codes from the visible URL/history immediately, before the
    // exchange network call, so they don't linger in browser history or get
    // sent as a Referer header to any resource this page happens to load.
    window.history.replaceState({}, "", window.location.pathname);

    if (!code) {
      setError("Missing handoff code.");
      return;
    }

    (async () => {
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
    // Intentionally run once on mount only. Next.js patches window.history
    // to keep its router state in sync, so the replaceState() call above
    // produces a new `searchParams` object on the next render; if that's a
    // dependency here, the effect re-fires with the now-stripped (empty)
    // code and can loop / clobber the real result before it lands.
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
