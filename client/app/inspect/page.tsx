"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TillInspectionBanner } from "@/components/dashboard/till-inspection-banner";
import { DeviceDiagnosticsPanel } from "@/components/settings/device-diagnostics";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";

/**
 * Where a read-only admin inspection session renders. Deliberately outside
 * the (dashboard) route group: DashboardLayout hard-requires a staff `user`
 * and redirects to /login without one, so an admin inspecting a till that is
 * logged out for the night could never get in. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
export default function InspectPage() {
  const router = useRouter();
  // Mounted flag: reading sessionStorage during render makes the server/
  // prerender pass and the first client pass disagree, which React reports as
  // a hydration mismatch. auth-context avoids the same trap.
  const [mounted, setMounted] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const live = isTillInspectionSession();
    setMounted(true);
    setHasSession(live);
    if (!live) router.replace("/login");
  }, [router]);

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
