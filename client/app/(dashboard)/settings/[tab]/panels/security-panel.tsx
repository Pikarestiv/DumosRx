import { SecuritySettings } from "@/components/settings/security-settings";
import { SessionsList } from "@/components/settings/account/sessions-list";
import type { SettingsState } from "@/hooks/use-settings";

export function SecurityPanel(s: SettingsState) {
  return (
    <div className="space-y-6">
      <SecuritySettings
        currentPin={s.currentPin}
        setCurrentPin={s.setCurrentPin}
        newPin={s.newPin}
        setNewPin={s.setNewPin}
        confirmPin={s.confirmPin}
        setConfirmPin={s.setConfirmPin}
        handleUpdateSecurity={s.handleUpdateSecurity}
      />
      <SessionsList />
    </div>
  );
}
