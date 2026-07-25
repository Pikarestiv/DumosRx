"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { LoyaltyRedemptionOptionRow } from "@/lib/db/queries/loyalty";
import { REDEMPTION_ICONS } from "./loyalty-icons";

const emptyForm = { label: "", points_cost: "0", description: "", icon_key: "tag", is_active: true };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: LoyaltyRedemptionOptionRow | null;
  userId?: string;
  nextSortOrder: number;
  onSaved: () => void;
}

export function LoyaltyRedemptionFormDialog({ open, onOpenChange, option, userId, nextSortOrder, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      option
        ? {
            label: option.label,
            points_cost: String(option.points_cost),
            description: option.description || "",
            icon_key: option.icon_key || "tag",
            is_active: !!option.is_active,
          }
        : emptyForm
    );
  }, [open, option]);

  const handleSave = async () => {
    if (!form.label.trim()) {
      toast.error("Reward label is required");
      return;
    }
    const payload = {
      user_id: userId,
      label: form.label.trim(),
      points_cost: Number(form.points_cost) || 0,
      description: form.description.trim(),
      icon_key: form.icon_key,
      is_active: form.is_active ? 1 : 0,
      sort_order: option?.sort_order ?? nextSortOrder,
    };
    try {
      if (option) {
        await update("loyalty_redemption_options", option.id, payload);
        toast.success("Reward updated");
      } else {
        await insert("loyalty_redemption_options", payload);
        toast.success("Reward added");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save reward");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{option ? "Edit Reward" : "Add Reward"}</DialogTitle>
          <DialogDescription>Configure a points redemption option customers can claim.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reward Label *</Label>
            <Input
              placeholder="e.g. ₦500 Discount"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Points Cost</Label>
              <Input
                type="number"
                min={0}
                value={form.points_cost}
                onChange={(e) => setForm({ ...form, points_cost: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Select value={form.icon_key} onValueChange={(val) => setForm({ ...form, icon_key: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(REDEMPTION_ICONS).map((key) => (
                    <SelectItem key={key} value={key}>{key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="e.g. Get ₦500 off your next purchase"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Reward</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
