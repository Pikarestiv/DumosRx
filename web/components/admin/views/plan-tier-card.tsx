import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumericConfigInput } from "@/components/admin/numeric-config-input";
import type {
  SubscriptionConfig,
  TierConfig,
  TierLimits,
  TierFeatures,
} from "@/lib/types/admin";

const MAX_PLAN_PRICE = 100_000_000;

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

const isAcceptablePrice = (price: number) =>
  price > 0 && price <= MAX_PLAN_PRICE;

const isAcceptableLimit = (limit: number) =>
  Number.isInteger(limit) && (limit === -1 || limit >= 1);

const describeLimit = (limit: number) => (limit === -1 ? "unlimited" : String(limit));

interface PlanTierCardProps {
  tierKey: "free" | "starter" | "pro" | "enterprise";
  title: string;
  config: SubscriptionConfig;
  setConfig: (config: SubscriptionConfig) => void;
  isFeatured?: boolean;
}

export function PlanTierCard({
  tierKey,
  title,
  config,
  setConfig,
  isFeatured = false,
}: PlanTierCardProps) {
  const tier = config.tiers[tierKey];

  const updateTier = (updates: Partial<TierConfig>) => {
    setConfig({
      ...config,
      tiers: {
        ...config.tiers,
        [tierKey]: { ...tier, ...updates },
      },
    });
  };

  const updateLimits = (updates: Partial<TierLimits>) => {
    updateTier({ limits: { ...tier.limits, ...updates } });
  };

  const updateFeatures = (updates: Partial<TierFeatures>) => {
    updateTier({ features: { ...tier.features, ...updates } });
  };

  const containerClass = isFeatured
    ? "p-4 border rounded-xl bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/10 dark:border-indigo-900/30 space-y-4"
    : "p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50 space-y-4";

  const labelClass = isFeatured
    ? "text-xs text-indigo-600/70 dark:text-indigo-400/70"
    : "text-xs text-muted-foreground";

  const inputClass = isFeatured
    ? "border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
    : "";

  const dividerClass = isFeatured
    ? "border-indigo-200/50 dark:border-indigo-800/50"
    : "";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between">
        <Label
          className={`font-bold text-base ${isFeatured ? "text-indigo-700 dark:text-indigo-400" : ""}`}
        >
          {title}
        </Label>
        <Switch
          checked={tier.active}
          onCheckedChange={(c) => updateTier({ active: c })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {tierKey !== "free" && (
          <>
            <NumericConfigInput
              label="Price (₦) / Month"
              labelClass={labelClass}
              inputClass={inputClass}
              value={tier.price_monthly}
              min={1}
              max={MAX_PLAN_PRICE}
              disabled={!tier.active}
              isAcceptable={isAcceptablePrice}
              rejectionHint={`Enter a price between ${naira(1)} and ${naira(MAX_PLAN_PRICE)}.`}
              formatValue={naira}
              onCommit={(price_monthly) => updateTier({ price_monthly })}
            />
            <NumericConfigInput
              label="Price (₦) / Year"
              labelClass={labelClass}
              inputClass={inputClass}
              value={tier.price_yearly}
              min={1}
              max={MAX_PLAN_PRICE}
              disabled={!tier.active}
              isAcceptable={isAcceptablePrice}
              rejectionHint={`Enter a price between ${naira(1)} and ${naira(MAX_PLAN_PRICE)}.`}
              formatValue={naira}
              onCommit={(price_yearly) => updateTier({ price_yearly })}
            />
          </>
        )}
        <div className={`pt-2 border-t col-span-2 ${dividerClass}`}>
          <NumericConfigInput
            id={`${tierKey}-max-staff`}
            label="Max Staff (-1 for ∞)"
            labelClass={labelClass}
            inputClass={inputClass}
            value={tier.limits.staff}
            min={-1}
            step={1}
            disabled={!tier.active}
            isAcceptable={isAcceptableLimit}
            rejectionHint="Enter a whole number of at least 1, or -1 for unlimited."
            formatValue={describeLimit}
            onCommit={(staff) => updateLimits({ staff })}
          />
        </div>
        <div className={`pt-2 border-t ${dividerClass}`}>
          <NumericConfigInput
            id={`${tierKey}-max-stores`}
            label="Max Stores (-1 for ∞)"
            labelClass={labelClass}
            inputClass={inputClass}
            value={tier.limits.stores}
            min={-1}
            step={1}
            disabled={!tier.active}
            isAcceptable={isAcceptableLimit}
            rejectionHint="Enter a whole number of at least 1, or -1 for unlimited."
            formatValue={describeLimit}
            onCommit={(stores) => updateLimits({ stores })}
          />
        </div>
        <div className={`space-y-2 pt-2 border-t col-span-2 ${dividerClass}`}>
          <Label className={labelClass}>Sync Interval (Mins, 0 = instant)</Label>
          <Input
            type="number"
            min={0}
            className={inputClass}
            value={tier.limits.sync_interval ?? 0}
            onChange={(e) => updateLimits({ sync_interval: Math.max(0, Number(e.target.value) || 0) })}
            disabled={!tier.active}
          />
        </div>

        <div className={`col-span-2 space-y-3 pt-3 border-t ${dividerClass}`}>
          <Label className={`${labelClass} block mb-2 font-bold`}>Feature Gates</Label>

          {(
            [
              { key: "cloud_sync", label: "Cloud Sync" },
              { key: "web_dashboard", label: "Web Dashboard" },
              { key: "mobile_app", label: "Mobile App" },
              { key: "ecommerce", label: "E-commerce URL" },
              { key: "smart_pos", label: "Smart POS" },
              { key: "custom_branding", label: "Custom Branding" },
              { key: "remove_branding", label: "Remove DumosRx Branding" },
              { key: "daily_summary_email", label: "Daily Summary Email" },
              { key: "procurement", label: "Procurement" },
              { key: "prescriptions", label: "Prescriptions" },
              { key: "expenses", label: "Expense Tracking" },
              { key: "audit_mode", label: "Stock Audits" },
              { key: "dark_mode", label: "Dark Mode" },
              { key: "smart_suggestions", label: "Smart Suggestions" },
              { key: "auto_lock", label: "Auto-Lock" },
              { key: "barcode_generation", label: "Barcode Generation" },
              { key: "loyalty_program", label: "Loyalty Program" },
              { key: "daily_close_report", label: "Daily Close Report" },
              { key: "advanced_reports", label: "Advanced Reports & BI" },
              { key: "reseller_commission", label: "Reseller Commission" },
              { key: "proforma_quotes", label: "Proforma Quotes" },
            ] satisfies { key: keyof TierFeatures; label: string }[]
          ).map((feat) => (
            <div key={feat.key} className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{feat.label}</Label>
              <Switch
                checked={tier.features[feat.key]}
                onCheckedChange={(c) => updateFeatures({ [feat.key]: c })}
                disabled={!tier.active}
                className="scale-75 origin-right"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
