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
import { useStore } from "@/lib/context/store-context";

interface RegisterConfigCardProps {
  requireSaleNotes: boolean;
  setRequireSaleNotes: (val: boolean) => void;
  displayStockLevels: boolean;
  setDisplayStockLevels: (val: boolean) => void;
}

interface ConfigRow {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function RegisterConfigCard({
  requireSaleNotes,
  setRequireSaleNotes,
  displayStockLevels,
  setDisplayStockLevels,
}: RegisterConfigCardProps) {
  const { updateStoreProfile } = useStore();

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
        updateStoreProfile({ require_sale_notes: checked ? 1 : 0 });
      },
    },
    {
      id: "display-stock-levels",
      label: "Display Item Stock Levels",
      description: "Show available stock next to each item while selling.",
      checked: displayStockLevels,
      onCheckedChange: (checked) => {
        setDisplayStockLevels(checked);
        updateStoreProfile({ display_stock_levels: checked ? 1 : 0 });
      },
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
              <Label htmlFor={row.id} className="text-base">
                {row.label}
              </Label>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </div>
            <Switch
              id={row.id}
              checked={row.checked}
              onCheckedChange={row.onCheckedChange}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
