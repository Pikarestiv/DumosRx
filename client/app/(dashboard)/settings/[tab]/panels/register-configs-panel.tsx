import { RegisterConfigCard } from "@/components/settings/store/register-config-card";
import type { SettingsState } from "@/hooks/use-settings";

export function RegisterConfigsPanel(s: SettingsState) {
  return (
    <RegisterConfigCard
      requireSaleNotes={s.requireSaleNotes}
      setRequireSaleNotes={s.setRequireSaleNotes}
      displayStockLevels={s.displayStockLevels}
      setDisplayStockLevels={s.setDisplayStockLevels}
    />
  );
}
