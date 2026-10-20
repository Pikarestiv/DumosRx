"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { consumePostRestoreCloudLinkNotice } from "@/lib/utils/post-restore-notice";
import { getAuthToken } from "@/lib/storage-keys";

interface UsePostRestoreCloudLinkNoticeOptions {
  // Opens whatever the "Link DumosRx Cloud" control already is for this screen (the CloudLinkDialog in-app, or the pre-login cloud step in the s…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-post-restore-cloud-link-notice-ts-L9
  onLinkCloud: () => void;
}

// Mount this once on any screen that can be the landing spot right after a post-restore reload (currently /login and the dashboard shell - see…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-post-restore-cloud-link-notice-L15
export function usePostRestoreCloudLinkNotice({
  onLinkCloud,
}: UsePostRestoreCloudLinkNoticeOptions): void {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    if (typeof window === "undefined") return;

    // Read the raw token directly rather than via useAuth()'s isCloudLinked:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-post-restore-cloud-link-notice-ts-L27
    const isCloudLinked = !!getAuthToken();

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
