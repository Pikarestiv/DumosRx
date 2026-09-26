import { PaymentSettingsCard } from "@/components/settings/store/payment-settings-card";
import { PaymentAccountsCard } from "@/components/settings/store/payment-accounts-card";
import { OnlinePaymentsSection } from "@/components/settings/store/online-payments-section";
import type { SettingsState } from "@/hooks/use-settings";

export function PaymentMethodsPanel(s: SettingsState) {
  return (
    <>
      <PaymentSettingsCard
        requirePaymentAccount={s.requirePaymentAccount}
        setRequirePaymentAccount={s.setRequirePaymentAccount}
        enabledPaymentMethods={s.enabledPaymentMethods}
        setEnabledPaymentMethods={s.setEnabledPaymentMethods}
      />
      <PaymentAccountsCard />
      {s.storeProfile && (
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
