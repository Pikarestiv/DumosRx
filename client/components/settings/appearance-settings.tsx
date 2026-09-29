"use client";

import { Theme } from "@/components/theme-provider";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { ThemeAppearanceCard } from "./theme-appearance-card";
import { SidebarPreferencesCard } from "./sidebar-preferences-card";
import { RegionalSettingsCard } from "./regional-settings-card";

interface AppearanceSettingsProps {
  theme: string | undefined;
  setTheme: (theme: Theme) => void;
  activeTheme: string;
  setAppTheme: (theme: string) => void;
  localCurrency: string;
  setLocalCurrency: (val: string) => void;
  localVat: string;
  setLocalVat: (val: string) => void;
  localResellerCommission: string;
  setLocalResellerCommission: (val: string) => void;
  handleSaveRegional: () => void;
}

export function AppearanceSettings({
  theme,
  setTheme,
  activeTheme,
  setAppTheme,
  localCurrency,
  setLocalCurrency,
  localVat,
  setLocalVat,
  localResellerCommission,
  setLocalResellerCommission,
  handleSaveRegional,
}: AppearanceSettingsProps) {
  // Currency, VAT and the reseller commission are store-wide figures that
  // happen to sit on the everyone-can-open General tab, so they carry their
  // own key while the theme and sidebar cards above stay open. Converted
  // from isAdmin, which is the same population by default.
  const canManageStoreSettings = useHasPermission("manage_store_settings");

  return (
    <div className="space-y-6">
      <ThemeAppearanceCard
        theme={theme}
        setTheme={setTheme}
        activeTheme={activeTheme}
        setAppTheme={setAppTheme}
      />

      <SidebarPreferencesCard />

      {canManageStoreSettings && (
        <RegionalSettingsCard
          localCurrency={localCurrency}
          setLocalCurrency={setLocalCurrency}
          localVat={localVat}
          setLocalVat={setLocalVat}
          localResellerCommission={localResellerCommission}
          setLocalResellerCommission={setLocalResellerCommission}
          handleSaveRegional={handleSaveRegional}
        />
      )}
    </div>
  );
}
