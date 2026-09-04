"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { consumePostRestoreCloudLinkNotice } from "@/lib/utils/post-restore-notice";

interface UsePostRestoreCloudLinkNoticeOptions {
  /** Opens whatever the "Link DumosRx Cloud" control already is for this
   * screen (the CloudLinkDialog in-app, or the pre-login cloud step in the
   * setup wizard) - this hook never builds its own linking UI. */
  onLinkCloud: () => void;
}

/**
 * Mount this once on any screen that can be the landing spot right after a
 * post-restore reload (currently /login and the dashboard shell - see
 * app/setup/use-onboarding.ts's handleLocalRestore and
 * hooks/use-settings-sync.ts's handleRestoreBackup /
 * handleRestoreBackupTauri, all of which call
 * markRestoredForCloudLinkNotice() right before reloading).
 *
 * Fires a single, hard-to-miss toast the moment it detects the device just
 * restored a local backup and is NOT cloud-linked - explaining that the
 * data is back but sync needs a manual re-link, with a direct action into
 * the existing cloud-link control. Deliberately does nothing on a normal
 * page load, and nothing if the restore left the device linked (or on any
 * later load, even unlinked) - the persistent "Not Linked" state is already
 * covered by the dashboard header's SyncIndicator; this is only the
 * restore-specific, one-time call-out.
 */
export function usePostRestoreCloudLinkNotice({
  onLinkCloud,
}: UsePostRestoreCloudLinkNoticeOptions): void {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    if (typeof window === "undefined") return;

    // Read the raw token directly rather than via useAuth()'s isCloudLinked:
    // AuthProvider sets that from the same localStorage key in its own
    // mount effect, but effect ordering between an ancestor provider and
    // this hook isn't guaranteed, so relying on the context value here
    // could observe its pre-mount default and consume the one-shot marker
    // on a stale answer.
    const isCloudLinked = !!localStorage.getItem("auth_token");

    if (!consumePostRestoreCloudLinkNotice(isCloudLinked)) return;

    toast.warning(
      "Your data is back, but this device isn't linked to cloud sync yet.",
      {
        description:
          "Local restore doesn't carry your cloud login along with it. Re-link your cloud account to resume automatic backups and sync.",
        duration: 20000,
        action: {
          label: "Link DumosRx Cloud",
          onClick: onLinkCloud,
        },
      },
    );
  }, [onLinkCloud]);
}
