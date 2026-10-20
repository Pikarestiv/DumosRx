"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// /setup used to be its own page; it's now the "setup" tab on the merged /login page (see app/login/page.tsx) so switching…
// Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-page-tsx-L7
export default function SetupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const step = searchParams.get("step");
    router.replace(`/login?tab=setup${step ? `&step=${step}` : ""}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
