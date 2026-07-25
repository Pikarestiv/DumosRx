import { useState, useEffect } from "react";

export function useSettingsForm(storeProfile: any, minimumSyncIntervalMinutes: number) {
  // Form States
  const [localName, setLocalName] = useState(storeProfile?.name || "");
  const [localAddress, setLocalAddress] = useState(storeProfile?.address || "");
  const [localPhone, setLocalPhone] = useState(storeProfile?.phone || "");
  const [localEmail, setLocalEmail] = useState(storeProfile?.email || "");
  const [localStoreSlug, setLocalStoreSlug] = useState(storeProfile?.store_slug || "");
  const [localCurrency, setLocalCurrency] = useState(storeProfile?.currency || "NGN");
  const [localVat, setLocalVat] = useState(storeProfile?.vat_percentage?.toString() || "7.5");
  const [localPcn, setLocalPcn] = useState(storeProfile?.pcn_license || "");
  const [localReceiptHeader, setLocalReceiptHeader] = useState(storeProfile?.receipt_header || "");
  const [localReceiptFooter, setLocalReceiptFooter] = useState(storeProfile?.receipt_footer || "");
  const [showLogo, setShowLogo] = useState(storeProfile?.show_logo_on_receipt === 1);
  const [showContact, setShowContact] = useState(storeProfile?.show_contact_on_receipt === 1);
  const [hidePoweredBy, setHidePoweredBy] = useState(storeProfile?.hide_powered_by === 1);
  const [lowStockAlert, setLowStockAlert] = useState(storeProfile?.low_stock_warning === 1);
  const [expiryAlert, setExpiryAlert] = useState(storeProfile?.expiry_warning === 1);
  const [expiryDays, setExpiryDays] = useState(storeProfile?.expiry_warning_days?.toString() || "90");
  const [localLogo, setLocalLogo] = useState(storeProfile?.logo_url || "");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(storeProfile?.auto_sync_enabled !== 0);
  const [autoSyncInterval, setAutoSyncInterval] = useState(storeProfile?.auto_sync_interval?.toString() || minimumSyncIntervalMinutes.toString());
  const [showRetailSuggestions, setShowRetailSuggestions] = useState(storeProfile?.show_retail_suggestions === 1);
  const [requirePaymentAccount, setRequirePaymentAccount] = useState(storeProfile?.require_payment_account === 1);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>(
    storeProfile?.enabled_payment_methods ? JSON.parse(storeProfile.enabled_payment_methods) : ["cash", "card", "transfer", "credit", "mixed"]
  );

  // Sync state with storeProfile
  useEffect(() => {
    if (storeProfile) {
      setLocalName(storeProfile.name || "");
      setLocalAddress(storeProfile.address || "");
      setLocalPhone(storeProfile.phone || "");
      setLocalEmail(storeProfile.email || "");
      setLocalStoreSlug(storeProfile.store_slug || "");
      setLocalCurrency(storeProfile.currency || "NGN");
      setLocalVat(storeProfile.vat_percentage?.toString() || "7.5");
      setLocalPcn(storeProfile.pcn_license || "");
      setLocalReceiptHeader(storeProfile.receipt_header || "");
      setLocalReceiptFooter(storeProfile.receipt_footer || "");
      setShowLogo(storeProfile.show_logo_on_receipt === 1);
      setShowContact(storeProfile.show_contact_on_receipt === 1);
      setHidePoweredBy(storeProfile.hide_powered_by === 1);
      setLowStockAlert(storeProfile.low_stock_warning === 1);
      setExpiryAlert(storeProfile.expiry_warning === 1);
      setExpiryDays(storeProfile.expiry_warning_days?.toString() || "90");
      setLocalLogo(storeProfile.logo_url || "");
      setAutoSyncEnabled(storeProfile.auto_sync_enabled !== 0);
      setShowRetailSuggestions(storeProfile.show_retail_suggestions === 1);
      setRequirePaymentAccount(storeProfile.require_payment_account === 1);
      try {
        setEnabledPaymentMethods(storeProfile.enabled_payment_methods ? JSON.parse(storeProfile.enabled_payment_methods) : ["cash", "card", "transfer", "credit", "mixed"]);
      } catch (_e) {
        setEnabledPaymentMethods(["cash", "card", "transfer", "credit", "mixed"]);
      }
      
      let interval = storeProfile.auto_sync_interval || minimumSyncIntervalMinutes;
      if (interval < minimumSyncIntervalMinutes) {
        interval = minimumSyncIntervalMinutes;
      }
      setAutoSyncInterval(interval.toString());
    }
  }, [storeProfile, minimumSyncIntervalMinutes]);

  return {
    localName, setLocalName,
    localAddress, setLocalAddress,
    localPhone, setLocalPhone,
    localEmail, setLocalEmail,
    localStoreSlug, setLocalStoreSlug,
    localCurrency, setLocalCurrency,
    localVat, setLocalVat,
    localPcn, setLocalPcn,
    localReceiptHeader, setLocalReceiptHeader,
    localReceiptFooter, setLocalReceiptFooter,
    showLogo, setShowLogo,
    showContact, setShowContact,
    hidePoweredBy, setHidePoweredBy,
    lowStockAlert, setLowStockAlert,
    expiryAlert, setExpiryAlert,
    expiryDays, setExpiryDays,
    localLogo, setLocalLogo,
    autoSyncEnabled, setAutoSyncEnabled,
    autoSyncInterval, setAutoSyncInterval,
    showRetailSuggestions, setShowRetailSuggestions,
    requirePaymentAccount, setRequirePaymentAccount,
    enabledPaymentMethods, setEnabledPaymentMethods,
  };
}
