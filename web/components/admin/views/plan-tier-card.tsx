import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SubscriptionConfig, TierConfig, TierLimits, TierFeatures } from "@/lib/types/admin";

/** Highest price this editor will accept, in naira. Mirrors the server-side
 * ceiling in SystemConfigController::update - a typo with an extra zero or
 * two is a far likelier explanation than a real ₦100m/month plan. */
const MAX_PLAN_PRICE = 100_000_000;

/** A price field that never lets a bad value into the saved config.
 *
 * The old implementation was `Number(e.target.value)` straight into form
 * state, so clearing the box published `Number("") === 0` - a live, free,
 * "paid" tier - and typing `-1` published a negative one. Here the raw text
 * is kept as local draft state and only *committed* to the config once it
 * parses as a positive number in range; anything else leaves the last good
 * value in place and explains why. Blurring discards the rejected draft so
 * what is on screen is always what would be saved. */
function PriceInput({
  label,
  labelClass,
  inputClass,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  labelClass: string;
  inputClass: string;
  value: number;
  disabled: boolean;
  onCommit: (price: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState(value);

  // A committed change (or a fresh config load) wins over a stale draft.
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(null);
  }

  const text = draft ?? String(value);
  const parsed = Number(text);
  const isRejected =
    text.trim() === "" ||
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_PLAN_PRICE;

  return (
    <div className="space-y-2">
      <Label className={labelClass}>{label}</Label>
      <Input
        type="number"
        min={1}
        max={MAX_PLAN_PRICE}
        className={`${inputClass} ${isRejected ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const candidate = Number(next);
          if (
            next.trim() !== "" &&
            Number.isFinite(candidate) &&
            candidate > 0 &&
            candidate <= MAX_PLAN_PRICE
          ) {
            onCommit(candidate);
          }
        }}
        onBlur={() => setDraft(null)}
        disabled={disabled}
      />
      {isRejected && (
        <p className="text-xs text-rose-500">
          Enter a price between ₦1 and ₦{MAX_PLAN_PRICE.toLocaleString()}. Until
          then ₦{value.toLocaleString()} stays saved.
        </p>
      )}
    </div>
  );
}

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
            <PriceInput
              label="Price (₦) / Month"
              labelClass={labelClass}
              inputClass={inputClass}
              value={tier.price_monthly}
              disabled={!tier.active}
              onCommit={(price_monthly) => updateTier({ price_monthly })}
            />
            <PriceInput
              label="Price (₦) / Year"
              labelClass={labelClass}
              inputClass={inputClass}
              value={tier.price_yearly}
              disabled={!tier.active}
              onCommit={(price_yearly) => updateTier({ price_yearly })}
            />
          </>
        )}
        <div className={`space-y-2 pt-2 border-t col-span-2 ${dividerClass}`}>
          <Label className={labelClass}>Max Staff (-1 for ∞)</Label>
          <Input
            type="number"
            className={inputClass}
            value={tier.limits.staff}
            onChange={(e) => updateLimits({ staff: Number(e.target.value) })}
            disabled={!tier.active}
          />
        </div>
        <div className={`space-y-2 pt-2 border-t ${dividerClass}`}>
          <Label className={labelClass}>Max Stores (-1 for ∞)</Label>
          <Input
            type="number"
            className={inputClass}
            value={tier.limits.stores}
            onChange={(e) => updateLimits({ stores: Number(e.target.value) })}
            disabled={!tier.active}
          />
        </div>
        {/* Limits continued */}
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

        {/* Feature Toggles */}
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
