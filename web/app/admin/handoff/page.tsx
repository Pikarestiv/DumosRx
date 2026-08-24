"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";

function HandoffHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    window.history.replaceState({}, "", window.location.pathname);

    if (!code) {
      setError("Missing handoff code.");
      return;
    }

    (async () => {
      try {
        const { token, user } = await webApiClient.consumeHandoffCode(code);
        localStorage.setItem("drx_admin_token", token);
        localStorage.setItem("drx_admin_user", JSON.stringify(user));
        toast.success("Session Restored", { description: "Back to Admin Dashboard" });
        router.replace("/admin/stores/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore admin session.");
      }
    })();
    // Intentionally run once on mount only. Next.js patches window.history
    // to keep its router state in sync, so the replaceState() call above
    // produces a new `searchParams` object on the next render — if that's a
    // dependency here, the effect re-fires with the now-stripped (empty)
    // code and can loop / clobber the real result before it lands.
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
