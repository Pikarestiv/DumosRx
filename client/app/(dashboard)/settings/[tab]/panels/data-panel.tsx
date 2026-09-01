import { DataSettings } from "@/components/settings/data-settings";
import { DemoDataSettings } from "@/components/settings/demo-data-settings";
import type { SettingsState } from "@/hooks/use-settings";

export function DataPanel(s: SettingsState) {
  return (
    <>
      <DataSettings
        isCloudLinked={s.isCloudLinked}
        autoSyncEnabled={s.autoSyncEnabled}
        setAutoSyncEnabled={s.setAutoSyncEnabled}
        autoSyncInterval={s.autoSyncInterval}
        setAutoSyncInterval={s.setAutoSyncInterval}
        handleSaveAutoSyncSettings={s.handleSaveAutoSyncSettings}
        handleSync={s.handleSync}
        handleDownloadBackup={s.handleDownloadBackup}
        handleRestoreBackup={s.handleRestoreBackup}
        handleRestoreBackupTauri={s.handleRestoreBackupTauri}
        isTauri={s.isTauri}
        handleResetDatabase={s.handleResetDatabase}
        setIsCloudLinkOpen={s.setIsCloudLinkOpen}
        setSyncAfterLink={s.setSyncAfterLink}
      />
      <div className="mt-6">
        <DemoDataSettings />
      </div>
    </>
  );
}
