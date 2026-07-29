"use client";

import { Theme } from "@/components/theme-provider";
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
  handleSaveRegional: () => void;
  isAdmin: boolean;
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
  handleSaveRegional,
  isAdmin,
}: AppearanceSettingsProps) {
  return (
    <div className="space-y-6">
      <ThemeAppearanceCard
        theme={theme}
        setTheme={setTheme}
        activeTheme={activeTheme}
        setAppTheme={setAppTheme}
      />

      <SidebarPreferencesCard />

      {isAdmin && (
        <RegionalSettingsCard
          localCurrency={localCurrency}
          setLocalCurrency={setLocalCurrency}
          localVat={localVat}
          setLocalVat={setLocalVat}
          handleSaveRegional={handleSaveRegional}
        />
      )}
    </div>
  );
}
