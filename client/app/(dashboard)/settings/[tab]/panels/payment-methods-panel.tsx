"use client";

import { PaymentSettingsCard } from "@/components/settings/store/payment-settings-card";
import { PaymentAccountsCard } from "@/components/settings/store/payment-accounts-card";
import { OnlinePaymentsSection } from "@/components/settings/store/online-payments-section";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { EnterpriseBadge } from "@/components/settings/store/enterprise-badge";
import type { SettingsState } from "@/hooks/use-settings";

export function PaymentMethodsPanel(s: SettingsState) {
  // The tab itself is manage_payment_accounts.
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-(dashboard)-settings-[tab]-panels-payment-methods-panel-tsx-L10
  const canManageOnlineStore = useHasPermission("manage_online_store");
  const { storefrontEntitlements } = useFeatureGate();

  return (
    <>
      <PaymentSettingsCard
        requirePaymentAccount={s.requirePaymentAccount}
        setRequirePaymentAccount={s.setRequirePaymentAccount}
        enabledPaymentMethods={s.enabledPaymentMethods}
        setEnabledPaymentMethods={s.setEnabledPaymentMethods}
      />
      <PaymentAccountsCard />
      {canManageOnlineStore && s.storeProfile && !storefrontEntitlements.checkout_paystack && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span>Taking card payments on your storefront is part of the Enterprise plan.</span>
          <EnterpriseBadge />
        </div>
      )}
      {canManageOnlineStore && s.storeProfile && storefrontEntitlements.checkout_paystack && (
        <OnlinePaymentsSection
          storeId={s.storeProfile.id}
          connectedSubaccountCode={s.storeProfile.paystack_subaccount_code}
          connectedBankCode={s.storeProfile.paystack_bank_code}
          connectedAccountLast4={s.storeProfile.paystack_account_number_last4}
        />
      )}
    </>
  );
}
