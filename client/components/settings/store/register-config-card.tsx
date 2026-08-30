"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";

interface RegisterConfigCardProps {
  requireSaleNotes: boolean;
  setRequireSaleNotes: (val: boolean) => void;
  displayStockLevels: boolean;
  setDisplayStockLevels: (val: boolean) => void;
  handleSaveRegisterConfig: () => void;
}

interface ConfigRow {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
}

export function RegisterConfigCard({
  requireSaleNotes,
  setRequireSaleNotes,
  displayStockLevels,
  setDisplayStockLevels,
  handleSaveRegisterConfig,
}: RegisterConfigCardProps) {
  const rows: ConfigRow[] = [
    {
      id: "require-sale-notes",
      label: "Require Sale Notes",
      description: "Ensure every sale includes a note before checkout can be completed.",
      checked: requireSaleNotes,
      onCheckedChange: setRequireSaleNotes,
    },
    {
      id: "display-stock-levels",
      label: "Display Item Stock Levels",
      description: "Show available stock next to each item while selling.",
      checked: displayStockLevels,
      onCheckedChange: setDisplayStockLevels,
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
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSaveRegisterConfig}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
}
