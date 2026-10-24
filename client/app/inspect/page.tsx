"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TillInspectionBanner } from "@/components/dashboard/till-inspection-banner";
import { DeviceDiagnosticsPanel } from "@/components/settings/device-diagnostics";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// Where a read-only admin inspection session renders.
// Rationale: docs/CLIENT_COMMENTS.md#block-app-inspect-page-tsx-L9
export default function InspectPage() {
  const router = useRouter();
  // Mounted flag: reading sessionStorage during render makes the server/ prerender pass and the first client pass disagree,…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-inspect-page-tsx-L18
  const mounted = useHydrated();
  const hasSession = mounted && isTillInspectionSession();

  useEffect(() => {
    if (mounted && !hasSession) router.replace("/login");
  }, [mounted, hasSession, router]);

  if (!mounted || !hasSession) return null;

  return (
    <div className="min-h-screen bg-background">
      <TillInspectionBanner />
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-2xl font-bold mb-1">Device diagnostics</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-prose">
          What this till believes about its own sync. Read from its local
          database; nothing is changed by opening this page.
        </p>
        <DeviceDiagnosticsPanel />
      </main>
    </div>
  );
}
