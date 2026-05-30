"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StoreType } from "@/lib/context/store-context";
import { DevSeedButton } from "@/components/dev/seed-button";

import { BusinessVerticalCard } from "./store/business-vertical-card";
import { StoreInformationCard } from "./store/store-information-card";
import { ReceiptCustomizationCard } from "./store/receipt-customization-card";

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
  localPcn: string;
  setLocalPcn: (val: string) => void;
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
  handleSaveReceiptSettings: () => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
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
  localPcn,
  setLocalPcn,
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
  handleSaveReceiptSettings,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
}: StoreSettingsProps) {
  return (
    <div className="space-y-6">
      <BusinessVerticalCard
        storeType={storeType}
        handleSwitchVertical={handleSwitchVertical}
      />

      <StoreInformationCard
        storeType={storeType}
        localName={localName}
        setLocalName={setLocalName}
        localAddress={localAddress}
        setLocalAddress={setLocalAddress}
        localPhone={localPhone}
        setLocalPhone={setLocalPhone}
        localEmail={localEmail}
        setLocalEmail={setLocalEmail}
        localPcn={localPcn}
        setLocalPcn={setLocalPcn}
        showRetailSuggestions={showRetailSuggestions}
        setShowRetailSuggestions={setShowRetailSuggestions}
        handleSaveProfile={handleSaveProfile}
      />

      <ReceiptCustomizationCard
        localName={localName}
        localAddress={localAddress}
        localPhone={localPhone}
        localLogo={localLogo}
        handleLogoUpload={handleLogoUpload}
        handleRemoveLogo={handleRemoveLogo}
        localReceiptHeader={localReceiptHeader}
        setLocalReceiptHeader={setLocalReceiptHeader}
        localReceiptFooter={localReceiptFooter}
        setLocalReceiptFooter={setLocalReceiptFooter}
        showLogo={showLogo}
        setShowLogo={setShowLogo}
        showContact={showContact}
        setShowContact={setShowContact}
        handleSaveReceiptSettings={handleSaveReceiptSettings}
      />

      {/* Developer Tools */}
      {process.env.NODE_ENV === "development" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Developer Tools</CardTitle>
            <CardDescription>
              Local database management utilities. These are only visible in development mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DevSeedButton />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
