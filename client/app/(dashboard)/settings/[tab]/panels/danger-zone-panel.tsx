import { DeviceDangerZone } from "@/components/settings/danger-zone/device-danger-zone";
import { CloudDangerZone } from "@/components/settings/danger-zone/cloud-danger-zone";
import type { SettingsState } from "@/hooks/use-settings";

export function DangerZonePanel(s: SettingsState) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Everything below is destructive and, in most cases, irreversible.
        Read each card&apos;s description before confirming - the two
        sections below have different blast radii.
      </p>
      <DeviceDangerZone
        isCloudLinked={s.isCloudLinked}
        handleResetDatabase={() => void s.handleResetDatabase()}
      />
      <CloudDangerZone />
    </div>
  );
}
