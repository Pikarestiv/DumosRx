import { AppearanceSettings } from "@/components/settings/appearance-settings";
import type { SettingsState } from "@/hooks/use-settings";

export function AppearancePanel(s: SettingsState) {
  return (
    <AppearanceSettings
      theme={s.theme}
      setTheme={s.setTheme}
      activeTheme={s.activeTheme}
      setAppTheme={s.setAppTheme}
      localCurrency={s.localCurrency}
      setLocalCurrency={s.setLocalCurrency}
      localVat={s.localVat}
      setLocalVat={s.setLocalVat}
      handleSaveRegional={s.handleSaveRegional}
      isAdmin={s.isAdmin}
    />
  );
}
