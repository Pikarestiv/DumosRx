"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
        const { token } = await apiClient.consumeHandoffCode(code);
        apiClient.setToken(token);

        if (returnCode) {
          localStorage.setItem("impersonator_handoff_return_code", returnCode);
        }

        router.replace("/dashboard");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete sign-in.");
      }
    })();
  }, [searchParams, router]);

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
