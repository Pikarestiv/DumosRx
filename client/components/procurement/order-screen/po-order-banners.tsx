"use client";

import { PoSaveBanner } from "./po-save-status";
import type { BlockedReason } from "./use-po-autosave";

interface PoOrderBannersProps {
  saveError: Error | null;
  conflicted: boolean;
  blocked: BlockedReason | null;
  otherDeviceLabel: string;
  lockedSince: string | null;
  onTakeOver: () => void;
  onRetry: () => void;
  onReloadTheirs: () => void;
  onKeepMineAsCopy: () => void;
  onOpenOrder: () => void;
}

export function PoOrderBanners(props: PoOrderBannersProps) {
  return (
    <>
      {props.saveError && (
        <PoSaveBanner
          tone="error"
          title="This order didn't save on this device"
          description={`Your changes are still on screen. ${props.saveError.message}`}
          actions={[{ label: "Retry", run: props.onRetry }, { label: "Save now", run: props.onRetry }]}
        />
      )}
      {props.conflicted && !props.blocked && (
        <PoSaveBanner
          tone="warning"
          title={`Your edit wasn't saved because ${props.otherDeviceLabel} changed it first`}
          description="Load their version, or keep what is on your screen as a separate new draft."
          actions={[
            { label: "Reload their version", run: props.onReloadTheirs },
            { label: "Keep mine as a new draft", run: props.onKeepMineAsCopy },
          ]}
        />
      )}
      {props.blocked === "not_editable" && (
        <PoSaveBanner
          tone="warning"
          title="This order can't be edited any more"
          description="It was received or closed on another till, so changes here are no longer saved."
          actions={[
            { label: "Open the order", run: props.onOpenOrder },
            { label: "Keep mine as a new draft", run: props.onKeepMineAsCopy },
          ]}
        />
      )}
      {props.lockedSince && (
        <PoSaveBanner
          tone="warning"
          title={`Being edited on ${props.otherDeviceLabel}`}
          description={`Last saved there ${props.lockedSince}. You can look, but changes here are not saved unless you take over.`}
          actions={[{ label: "Take over", run: props.onTakeOver }]}
        />
      )}
      {props.blocked === "deleted" && (
        <PoSaveBanner
          tone="warning"
          title="This order was deleted on another till"
          description="Changes here are no longer saved."
          actions={[{ label: "Keep mine as a new draft", run: props.onKeepMineAsCopy }]}
        />
      )}
    </>
  );
}
