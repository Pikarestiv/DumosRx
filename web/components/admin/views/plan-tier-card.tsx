import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PlanTierCardProps {
  tierKey: "free" | "starter" | "pro" | "enterprise";
  title: string;
  config: any;
  setConfig: (config: any) => void;
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

  const updateTier = (updates: any) => {
    setConfig({
      ...config,
      tiers: {
        ...config.tiers,
        [tierKey]: { ...tier, ...updates },
      },
    });
  };

  const updateLimits = (updates: any) => {
    updateTier({ limits: { ...tier.limits, ...updates } });
  };

  const updateFeatures = (updates: any) => {
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
            <div className="space-y-2">
              <Label className={labelClass}>Price (₦) / Month</Label>
              <Input
                type="number"
                className={inputClass}
                value={tier.price_monthly}
                onChange={(e) => updateTier({ price_monthly: Number(e.target.value) })}
                disabled={!tier.active}
              />
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>Price (₦) / Year</Label>
              <Input
                type="number"
                className={inputClass}
                value={tier.price_yearly}
                onChange={(e) => updateTier({ price_yearly: Number(e.target.value) })}
                disabled={!tier.active}
              />
            </div>
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
          <Label className={labelClass}>Sync Interval (Mins)</Label>
          <Input
            type="number"
            className={inputClass}
            value={tier.limits.sync_interval}
            onChange={(e) => updateLimits({ sync_interval: Number(e.target.value) })}
            disabled={!tier.active}
          />
        </div>

        {/* Feature Toggles */}
        <div className={`col-span-2 space-y-3 pt-3 border-t ${dividerClass}`}>
          <Label className={`${labelClass} block mb-2 font-bold`}>Feature Gates</Label>

          {[
            { key: "cloud_sync", label: "Cloud Sync" },
            { key: "web_dashboard", label: "Web Dashboard" },
            { key: "mobile_app", label: "Mobile App" },
            { key: "ecommerce", label: "E-commerce URL" },
            { key: "smart_pos", label: "Smart POS" },
            { key: "broadcast_create", label: "Email Broadcasting" },
            { key: "custom_branding", label: "Custom Branding" },
            { key: "auto_backup", label: "Auto Backups" },
            { key: "multi_store", label: "Multi-Store Mgmt" },
            { key: "procurement", label: "Procurement" },
            { key: "prescriptions", label: "Prescriptions" },
            { key: "expenses", label: "Expense Tracking" },
            { key: "audit_mode", label: "Stock Audits" },
            { key: "dark_mode", label: "Dark Mode" },
            { key: "smart_suggestions", label: "Smart Suggestions" },
            { key: "auto_lock", label: "Auto-Lock" },
            { key: "barcode_generation", label: "Barcode Generation" },
            { key: "loyalty_program", label: "Loyalty Program" },
          ].map((feat) => (
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
