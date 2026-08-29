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
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { LoyaltyTierRow } from "@/lib/db/queries/loyalty";
import { TIER_COLORS } from "./loyalty-icons";

const emptyForm = { name: "", min_spend: "0", points_multiplier: "1", benefits: "", color: "bg-amber-600" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: LoyaltyTierRow | null;
  userId?: string;
  nextSortOrder: number;
  onSaved: () => void;
}

export function LoyaltyTierFormDialog({ open, onOpenChange, tier, userId, nextSortOrder, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      tier
        ? {
            name: tier.name,
            min_spend: String(tier.min_spend),
            points_multiplier: String(tier.points_multiplier),
            benefits: (JSON.parse(tier.benefits || "[]") as string[]).join(", "),
            color: tier.color,
          }
        : emptyForm
    );
    setIsSaving(false);
  }, [open, tier]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Tier name is required");
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    const payload = {
      user_id: userId,
      name: form.name.trim(),
      min_spend: Number(form.min_spend) || 0,
      points_multiplier: Number(form.points_multiplier) || 1,
      benefits: JSON.stringify(form.benefits.split(",").map((b) => b.trim()).filter(Boolean)),
      color: form.color,
      sort_order: tier?.sort_order ?? nextSortOrder,
    };
    try {
      if (tier) {
        await update("loyalty_tiers", tier.id, payload);
        toast.success("Tier updated");
      } else {
        await insert("loyalty_tiers", payload);
        toast.success("Tier added");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save tier");
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tier ? "Edit Tier" : "Add Tier"}</DialogTitle>
          <DialogDescription>Configure the spending threshold and rewards for this tier.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tier Name *</Label>
            <Input
              placeholder="e.g. Gold"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Spend</Label>
              <Input
                type="number"
                min={0}
                value={form.min_spend}
                onChange={(e) => setForm({ ...form, min_spend: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Points Multiplier</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={form.points_multiplier}
                onChange={(e) => setForm({ ...form, points_multiplier: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <Select value={form.color} onValueChange={(val) => setForm({ ...form, color: val })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIER_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Benefits (comma-separated)</Label>
            <Input
              placeholder="e.g. Priority support, Birthday discount 10%"
              value={form.benefits}
              onChange={(e) => setForm({ ...form, benefits: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Tier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
