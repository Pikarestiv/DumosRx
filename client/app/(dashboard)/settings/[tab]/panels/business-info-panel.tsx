import { BusinessVerticalCard } from "@/components/settings/store/business-vertical-card";
import { BusinessInformationCard } from "@/components/settings/store/business-information-card";
import { OnlineStorefrontCard } from "@/components/settings/store/online-storefront-card";
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
        localTaxNumber={s.localTaxNumber}
        setLocalTaxNumber={s.setLocalTaxNumber}
        localLogo={s.localLogo}
        handleLogoUpload={s.handleLogoUpload}
        handleRemoveLogo={s.handleRemoveLogo}
        localPcn={s.localPcn}
        setLocalPcn={s.setLocalPcn}
        showRetailSuggestions={s.showRetailSuggestions}
        setShowRetailSuggestions={s.setShowRetailSuggestions}
        loyaltyProgramEnabled={s.loyaltyProgramEnabled}
        setLoyaltyProgramEnabled={s.setLoyaltyProgramEnabled}
        canAccessLoyaltyProgramPlan={s.canAccessLoyaltyProgramPlan}
        handleSaveProfile={() => void s.handleSaveProfile()}
      />
      <OnlineStorefrontCard
        localStoreSlug={s.localStoreSlug}
        onlineStoreEnabled={s.onlineStoreEnabled}
      />
    </>
  );
}
