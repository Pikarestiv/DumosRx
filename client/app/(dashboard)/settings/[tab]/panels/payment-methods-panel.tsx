"use client";

import { PaymentSettingsCard } from "@/components/settings/store/payment-settings-card";
import { PaymentAccountsCard } from "@/components/settings/store/payment-accounts-card";
import { OnlinePaymentsSection } from "@/components/settings/store/online-payments-section";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import type { SettingsState } from "@/hooks/use-settings";

export function PaymentMethodsPanel(s: SettingsState) {
  // The tab itself is manage_payment_accounts. This one section is the
  // storefront's payout onboarding and exists only so the public checkout
  // works, so it takes manage_online_store on top of the tab's own key.
  const canManageOnlineStore = useHasPermission("manage_online_store");

  return (
    <>
      <PaymentSettingsCard
        requirePaymentAccount={s.requirePaymentAccount}
        setRequirePaymentAccount={s.setRequirePaymentAccount}
        enabledPaymentMethods={s.enabledPaymentMethods}
        setEnabledPaymentMethods={s.setEnabledPaymentMethods}
      />
      <PaymentAccountsCard />
      {canManageOnlineStore && s.storeProfile && (
        <OnlinePaymentsSection
          storeId={s.storeProfile.id}
          storeName={s.storeProfile.name}
          connectedSubaccountCode={s.storeProfile.paystack_subaccount_code}
          connectedBankCode={s.storeProfile.paystack_bank_code}
          connectedAccountLast4={s.storeProfile.paystack_account_number_last4}
        />
      )}
    </>
  );
}
