import { ReceiptCustomizationCard } from "@/components/settings/store/receipt-customization-card";
import type { SettingsState } from "@/hooks/use-settings";

export function ReceiptSettingsPanel(s: SettingsState) {
  return (
    <ReceiptCustomizationCard
      localName={s.localName}
      localAddress={s.localAddress}
      localPhone={s.localPhone}
      localLogo={s.localLogo}
      localReceiptHeader={s.localReceiptHeader}
      setLocalReceiptHeader={s.setLocalReceiptHeader}
      localReceiptFooter={s.localReceiptFooter}
      setLocalReceiptFooter={s.setLocalReceiptFooter}
      localReceiptTagline={s.localReceiptTagline}
      setLocalReceiptTagline={s.setLocalReceiptTagline}
      showLogo={s.showLogo}
      setShowLogo={s.setShowLogo}
      logoPosition={s.logoPosition}
      setLogoPosition={s.setLogoPosition}
      showPhone={s.showPhone}
      setShowPhone={s.setShowPhone}
      showAddress={s.showAddress}
      setShowAddress={s.setShowAddress}
      hidePoweredBy={s.hidePoweredBy}
      setHidePoweredBy={s.setHidePoweredBy}
      handleSaveReceiptSettings={s.handleSaveReceiptSettings}
    />
  );
}
