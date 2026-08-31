import { BusinessVerticalCard } from "@/components/settings/store/business-vertical-card";
import { BusinessInformationCard } from "@/components/settings/store/business-information-card";
import { ContactSpecialistCard } from "@/components/settings/store/contact-specialist-card";
import type { SettingsState } from "@/hooks/use-settings";

export function BusinessInfoPanel(s: SettingsState) {
  return (
    <>
      <BusinessVerticalCard
        storeType={s.storeType}
        handleSwitchVertical={s.handleSwitchVertical}
      />
      <ContactSpecialistCard />
      <BusinessInformationCard
        storeType={s.storeType}
        localName={s.localName}
        setLocalName={s.setLocalName}
        localAddress={s.localAddress}
        setLocalAddress={s.setLocalAddress}
        localPhone={s.localPhone}
        setLocalPhone={s.setLocalPhone}
        localEmail={s.localEmail}
        setLocalEmail={s.setLocalEmail}
        localRegistrationNumber={s.localRegistrationNumber}
        setLocalRegistrationNumber={s.setLocalRegistrationNumber}
        localLogo={s.localLogo}
        handleLogoUpload={s.handleLogoUpload}
        handleRemoveLogo={s.handleRemoveLogo}
        localStoreSlug={s.localStoreSlug}
        setLocalStoreSlug={s.setLocalStoreSlug}
        localPcn={s.localPcn}
        setLocalPcn={s.setLocalPcn}
        showRetailSuggestions={s.showRetailSuggestions}
        setShowRetailSuggestions={s.setShowRetailSuggestions}
        onlineStoreEnabled={s.onlineStoreEnabled}
        setOnlineStoreEnabled={s.setOnlineStoreEnabled}
        handleSaveProfile={s.handleSaveProfile}
      />
    </>
  );
}
