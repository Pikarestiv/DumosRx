"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";

interface RegisterConfigCardProps {
  requireSaleNotes: boolean;
  setRequireSaleNotes: (val: boolean) => void;
  displayStockLevels: boolean;
  setDisplayStockLevels: (val: boolean) => void;
  uppercaseDisplayEnabled: boolean;
  setUppercaseDisplayEnabled: (val: boolean) => void;
}

interface ConfigRow {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  locked?: boolean;
}

export function RegisterConfigCard({
  requireSaleNotes,
  setRequireSaleNotes,
  displayStockLevels,
  setDisplayStockLevels,
  uppercaseDisplayEnabled,
  setUppercaseDisplayEnabled,
}: RegisterConfigCardProps) {
  const { storeProfile, updateStoreProfile } = useStore();
  const { canUseResellerCommission } = useFeatureGate();

  // Each row saves immediately on toggle — same as Payment Methods — rather
  // than sitting behind a Save button, so there's nothing to persist directly
  // via updateStoreProfile (not the (possibly stale) handleSave* closure).
  const rows: ConfigRow[] = [
    {
      id: "require-sale-notes",
      label: "Require Sale Notes",
      description: "Ensure every sale includes a note before checkout can be completed.",
      checked: requireSaleNotes,
      onCheckedChange: (checked) => {
        setRequireSaleNotes(checked);
        void updateStoreProfile({ require_sale_notes: checked ? 1 : 0 });
      },
    },
    {
      id: "display-stock-levels",
      label: "Display Item Stock Levels",
      description: "Show available stock next to each item while selling.",
      checked: displayStockLevels,
      onCheckedChange: (checked) => {
        setDisplayStockLevels(checked);
        void updateStoreProfile({ display_stock_levels: checked ? 1 : 0 });
      },
    },
    {
      id: "uppercase-display",
      label: "Display Names in Uppercase",
      description: "Show product and category names in uppercase across the app, receipts, and exports. Names are always stored the same way regardless of this setting.",
      checked: uppercaseDisplayEnabled,
      onCheckedChange: (checked) => {
        setUppercaseDisplayEnabled(checked);
        void updateStoreProfile({ uppercase_display_enabled: checked ? 1 : 0 });
      },
    },
    {
      id: "markup-sales",
      label: "Enable Markup Sales",
      description: "Let staff mark up a sale's price at checkout - either for a reseller agent (commission owed) or as a store markup kept in-house. Off by default.",
      checked: storeProfile?.markup_sales_enabled === 1,
      onCheckedChange: (checked) => {
        void updateStoreProfile({ markup_sales_enabled: checked ? 1 : 0 });
      },
      // Plan-tier entitlement, same gate the POS cart's reseller row itself
      // enforces (canUseMarkupSales) - without this a Free/Starter owner
      // could flip the toggle on and have it silently persist as a dead
      // setting, since the POS row would still never appear.
      locked: !canUseResellerCommission,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register Configs</CardTitle>
        <CardDescription>
          Manage specific configurations and settings for your registers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-4"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor={row.id} className="text-base">
                  {row.label}
                </Label>
                {row.locked && <Badge variant="outline">Pro Feature</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </div>
            <Switch
              id={row.id}
              checked={row.checked}
              disabled={row.locked}
              onCheckedChange={row.onCheckedChange}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
