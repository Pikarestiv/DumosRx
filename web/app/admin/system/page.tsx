"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Retired in admin Phase 1: telemetry now lives on /admin/operations. Kept
 * as a redirect so existing bookmarks resolve. See web/AGENTS.md. */
export default function SystemPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/operations");
  }, [router]);

  return null;
}
