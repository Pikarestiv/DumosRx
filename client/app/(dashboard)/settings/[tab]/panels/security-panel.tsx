import { SecuritySettings } from "@/components/settings/security-settings";
import type { SettingsState } from "@/hooks/use-settings";

export function SecurityPanel(s: SettingsState) {
  return (
    <SecuritySettings
      currentPin={s.currentPin}
      setCurrentPin={s.setCurrentPin}
      newPin={s.newPin}
      setNewPin={s.setNewPin}
      confirmPin={s.confirmPin}
      setConfirmPin={s.setConfirmPin}
      handleUpdateSecurity={s.handleUpdateSecurity}
    />
  );
}
