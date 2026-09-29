"use client";

import {
  Activity,
  CreditCard,
  Globe,
  Receipt,
  RefreshCw,
  Store as StoreIcon,
  User as UserIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DetailCard, Field } from "./store-detail-primitives";
import type { AdminStoreDetail } from "@/lib/types/admin";

export function StoreProfileCard({ store }: { store: AdminStoreDetail }) {
  return (
    <DetailCard title="Store Profile" icon={<StoreIcon className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Store ID" value={store.id} mono />
        <Field label="Store Type" value={store.store_type} />
        <Field label="Address" value={store.address} />
        <Field label="Location" value={store.location} />
        <Field label="Phone" value={store.phone} />
        <Field label="Email" value={store.email} />
        <Field label="Currency" value={store.currency} />
        <Field label="Timezone" value={store.timezone} />
        <Field label="VAT" value={store.vat_percentage != null ? `${store.vat_percentage}%` : null} />
        <Field label="PCN Licence" value={store.pcn_license} />
        <Field label="Registration No." value={store.registration_number} />
        <Field label="Created" value={store.created_at} />
      </div>
      {store.suspension_reason ? (
        <div className="rounded-xl bg-rose-500/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">
            Suspension Reason
          </p>
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {store.suspension_reason}
          </p>
        </div>
      ) : null}
    </DetailCard>
  );
}

export function StoreOwnerCard({ store }: { store: AdminStoreDetail }) {
  const owner = store.owner;

  return (
    <DetailCard title="Owner Account" icon={<UserIcon className="h-4 w-4" />}>
      {owner ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" value={owner.name} />
          <Field label="Role" value={owner.role} />
          <Field label="Email" value={owner.email} />
          <Field label="Phone" value={owner.phone} />
          <Field label="Account Status" value={owner.status} />
          <Field label="Last Login" value={owner.last_login_human} />
          <Field label="Member Since" value={owner.joined_at} />
          <Field label="User ID" value={owner.id} mono />
          {owner.deletion_requested ? (
            <div className="col-span-2">
              <Badge variant="destructive" className="font-bold">
                Account deletion requested
              </Badge>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-medium text-slate-500">
          This store has no owner account attached.
        </p>
      )}
    </DetailCard>
  );
}

export function StoreSubscriptionCard({ store }: { store: AdminStoreDetail }) {
  const subscription = store.subscription;

  return (
    <DetailCard title="Subscription" icon={<CreditCard className="h-4 w-4" />}>
      {subscription ? (
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Plan"
            value={
              <span className="capitalize">
                {subscription.plan}
                {subscription.is_trial ? (
                  <Badge className="ml-2 bg-amber-500 hover:bg-amber-600">Trial</Badge>
                ) : null}
              </span>
            }
          />
          <Field label="Status" value={<span className="capitalize">{subscription.status}</span>} />
          <Field label="Started" value={subscription.start_date} />
          <Field label="Ends" value={subscription.end_date} />
          <Field
            label="Days Remaining"
            value={subscription.days_remaining != null ? `${subscription.days_remaining} days` : null}
          />
          <Field label="Lifetime Revenue" value={store.revenue} />
        </div>
      ) : (
        <p className="text-sm font-medium text-slate-500">
          No subscription record for this store&apos;s owner.
        </p>
      )}
    </DetailCard>
  );
}

export function StoreSyncCard({ store }: { store: AdminStoreDetail }) {
  return (
    <DetailCard title="Sync Health" icon={<RefreshCw className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Last Sync" value={store.sync.last_sync_human} />
        <Field label="Auto Sync" value={store.sync.auto_sync_enabled ? "Enabled" : "Disabled"} />
        <Field
          label="Sync Interval"
          value={store.sync.auto_sync_interval != null ? `${store.sync.auto_sync_interval} min` : null}
        />
        <Field label="Device ID" value={store.sync.device_id} mono />
      </div>
    </DetailCard>
  );
}

export function StoreStorefrontCard({ store }: { store: AdminStoreDetail }) {
  return (
    <DetailCard title="Online Storefront" icon={<Globe className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Storefront"
          value={store.storefront.online_store_enabled ? "Published" : "Disabled"}
        />
        <Field label="Slug" value={store.storefront.store_slug} mono />
        <Field
          label="Pending Rebuild"
          value={
            store.storefront.pending_rebuild
              ? `Yes · changed ${store.storefront.dirty_since ?? "recently"}`
              : "No"
          }
        />
      </div>
      {store.storefront.pending_rebuild ? (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
          The published page is stale until the next full site rebuild.
        </p>
      ) : null}
    </DetailCard>
  );
}

function normalizeEnabledPaymentMethods(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    try {
      return normalizeEnabledPaymentMethods(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

export function StorePaymentsCard({ store }: { store: AdminStoreDetail }) {
  const payments = store.payments;
  const enabledPaymentMethods = normalizeEnabledPaymentMethods(
    payments.enabled_payment_methods,
  );

  return (
    <DetailCard title="Payments" icon={<Receipt className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Paystack Subaccount"
          value={payments.paystack_connected ? "Connected" : "Not connected"}
        />
        <Field label="Subaccount Code" value={payments.subaccount_code} mono />
        <Field label="Bank Code" value={payments.bank_code} mono />
        <Field
          label="Settlement Account"
          value={payments.account_number_last4 ? `•••• ${payments.account_number_last4}` : null}
        />
        <Field
          label="Payment Account Required"
          value={payments.require_payment_account ? "Yes" : "No"}
        />
        <Field
          label="Enabled Methods"
          value={enabledPaymentMethods.length > 0 ? enabledPaymentMethods.join(", ") : null}
        />
      </div>
    </DetailCard>
  );
}

export function StoreRecentTransactionsCard({ store }: { store: AdminStoreDetail }) {
  return (
    <DetailCard title="Recent Transactions" icon={<Receipt className="h-4 w-4" />}>
      {store.recent_transactions.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">No payment transactions recorded.</p>
      ) : (
        <ul className="space-y-2">
          {store.recent_transactions.map((txn) => (
            <li
              key={txn.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {txn.desc}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {txn.date}
                  {txn.reference ? ` · ${txn.reference}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-sm">{txn.amount}</p>
                <p
                  className={`text-[11px] font-bold ${
                    txn.status.toLowerCase() === "success"
                      ? "text-emerald-500"
                      : txn.status.toLowerCase() === "failed"
                        ? "text-rose-500"
                        : "text-amber-500"
                  }`}
                >
                  {txn.status}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

export function StoreRecentActivityCard({ store }: { store: AdminStoreDetail }) {
  return (
    <DetailCard title="Recent Activity" icon={<Activity className="h-4 w-4" />}>
      {store.recent_activity.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">No activity recorded for this store.</p>
      ) : (
        <ul className="space-y-3">
          {store.recent_activity.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {entry.action}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                  {entry.description}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  {entry.actor ? `${entry.actor} · ` : ""}
                  {entry.at}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}
