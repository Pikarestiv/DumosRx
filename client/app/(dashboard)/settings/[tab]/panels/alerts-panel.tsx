import { AlertSettings } from "@/components/settings/alert-settings";
import type { SettingsState } from "@/hooks/use-settings";

export function AlertsPanel(s: SettingsState) {
  return (
    <AlertSettings
      lowStockAlert={s.lowStockAlert}
      setLowStockAlert={s.setLowStockAlert}
      expiryAlert={s.expiryAlert}
      setExpiryAlert={s.setExpiryAlert}
      expiryDays={s.expiryDays}
      setExpiryDays={s.setExpiryDays}
      handleSaveAlertSettings={s.handleSaveAlertSettings}
    />
  );
}
