"use client";

import { StoreType } from "@/lib/context/store-context";

import { BusinessVerticalCard } from "./store/business-vertical-card";
import { BusinessInformationCard } from "./store/business-information-card";
import { CategoriesCard } from "./store/categories-card";
import { ReceiptCustomizationCard } from "./store/receipt-customization-card";
import { PaymentSettingsCard } from "./store/payment-settings-card";
import { PaymentAccountsCard } from "./store/payment-accounts-card";
import { MultiStoreCard } from "./store/multi-store-card";
import { FleetOverview } from "./store/fleet-overview";

interface StoreSettingsProps {
  storeType: StoreType;
  handleSwitchVertical: (type: StoreType) => void;
  localName: string;
  setLocalName: (val: string) => void;
  localAddress: string;
  setLocalAddress: (val: string) => void;
  localPhone: string;
  setLocalPhone: (val: string) => void;
  localEmail: string;
  setLocalEmail: (val: string) => void;
  localStoreSlug: string;
  setLocalStoreSlug: (val: string) => void;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  localRegistrationNumber: string;
  setLocalRegistrationNumber: (val: string) => void;
  handleSaveProfile: () => void;
  localLogo: string;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveLogo: () => void;
  localReceiptHeader: string;
  setLocalReceiptHeader: (val: string) => void;
  localReceiptFooter: string;
  setLocalReceiptFooter: (val: string) => void;
  showLogo: boolean;
  setShowLogo: (val: boolean) => void;
  showContact: boolean;
  setShowContact: (val: boolean) => void;
  hidePoweredBy: boolean;
  setHidePoweredBy: (val: boolean) => void;
  handleSaveReceiptSettings: () => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
  requirePaymentAccount: boolean;
  setRequirePaymentAccount: (val: boolean) => void;
  onlineStoreEnabled?: boolean;
  setOnlineStoreEnabled?: (val: boolean) => void;
  enabledPaymentMethods: string[];
  setEnabledPaymentMethods: (val: string[]) => void;
}

export function StoreSettings({
  storeType,
  handleSwitchVertical,
  localName,
  setLocalName,
  localAddress,
  setLocalAddress,
  localPhone,
  setLocalPhone,
  localEmail,
  setLocalEmail,
  localStoreSlug,
  setLocalStoreSlug,
  localPcn,
  setLocalPcn,
  localRegistrationNumber,
  setLocalRegistrationNumber,
  handleSaveProfile,
  localLogo,
  handleLogoUpload,
  handleRemoveLogo,
  localReceiptHeader,
  setLocalReceiptHeader,
  localReceiptFooter,
  setLocalReceiptFooter,
  showLogo,
  setShowLogo,
  showContact,
  setShowContact,
  hidePoweredBy,
  setHidePoweredBy,
  handleSaveReceiptSettings,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
  requirePaymentAccount,
  setRequirePaymentAccount,
  onlineStoreEnabled = false,
  setOnlineStoreEnabled,
  enabledPaymentMethods,
  setEnabledPaymentMethods,
}: StoreSettingsProps) {
  return (
    <div className="space-y-6">
      <BusinessVerticalCard
        storeType={storeType}
        handleSwitchVertical={handleSwitchVertical}
      />

      <BusinessInformationCard
        storeType={storeType}
        localName={localName}
        setLocalName={setLocalName}
        localAddress={localAddress}
        setLocalAddress={setLocalAddress}
        localPhone={localPhone}
        setLocalPhone={setLocalPhone}
        localEmail={localEmail}
        setLocalEmail={setLocalEmail}
        localRegistrationNumber={localRegistrationNumber}
        setLocalRegistrationNumber={setLocalRegistrationNumber}
        localLogo={localLogo}
        handleLogoUpload={handleLogoUpload}
        handleRemoveLogo={handleRemoveLogo}
        localStoreSlug={localStoreSlug}
        setLocalStoreSlug={setLocalStoreSlug}
        localPcn={localPcn}
        setLocalPcn={setLocalPcn}
        showRetailSuggestions={showRetailSuggestions}
        setShowRetailSuggestions={setShowRetailSuggestions}
        onlineStoreEnabled={onlineStoreEnabled}
        setOnlineStoreEnabled={setOnlineStoreEnabled}
        handleSaveProfile={handleSaveProfile}
      />

      <CategoriesCard />

      <ReceiptCustomizationCard
        localName={localName}
        localAddress={localAddress}
        localPhone={localPhone}
        localLogo={localLogo}
        localReceiptHeader={localReceiptHeader}
        setLocalReceiptHeader={setLocalReceiptHeader}
        localReceiptFooter={localReceiptFooter}
        setLocalReceiptFooter={setLocalReceiptFooter}
        showLogo={showLogo}
        setShowLogo={setShowLogo}
        showContact={showContact}
        setShowContact={setShowContact}
        hidePoweredBy={hidePoweredBy}
        setHidePoweredBy={setHidePoweredBy}
        handleSaveReceiptSettings={handleSaveReceiptSettings}
      />

      <PaymentSettingsCard
        requirePaymentAccount={requirePaymentAccount}
        setRequirePaymentAccount={setRequirePaymentAccount}
        enabledPaymentMethods={enabledPaymentMethods}
        setEnabledPaymentMethods={setEnabledPaymentMethods}
        handleSaveProfile={handleSaveProfile}
      />

      <PaymentAccountsCard />

      <FleetOverview />

      <MultiStoreCard />
    </div>
  );
}
