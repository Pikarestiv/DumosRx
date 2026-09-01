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
      showLogo={s.showLogo}
      setShowLogo={s.setShowLogo}
      showContact={s.showContact}
      setShowContact={s.setShowContact}
      hidePoweredBy={s.hidePoweredBy}
      setHidePoweredBy={s.setHidePoweredBy}
      handleSaveReceiptSettings={s.handleSaveReceiptSettings}
    />
  );
}
