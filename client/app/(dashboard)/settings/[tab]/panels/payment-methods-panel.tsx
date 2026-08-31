import { PaymentSettingsCard } from "@/components/settings/store/payment-settings-card";
import { PaymentAccountsCard } from "@/components/settings/store/payment-accounts-card";
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
    </>
  );
}
