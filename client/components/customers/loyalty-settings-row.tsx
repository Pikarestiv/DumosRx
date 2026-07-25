"use client";

import type { ReactNode } from "react";
import { Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  leading: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}

/** Shared row layout for the tier and redemption-option lists in loyalty settings. */
export function LoyaltySettingsRow({ leading, title, subtitle, onEdit, onDelete }: Props) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        {leading}
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
