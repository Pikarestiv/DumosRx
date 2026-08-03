"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { AdminUser } from "@/lib/types/admin";

interface ReferralsAdjustDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  users: AdminUser[];
  onAdjust: (
    userId: string,
    amount: number,
    type: "earned" | "spent" | "admin_adjustment",
    description: string
  ) => Promise<void>;
}

export function ReferralsAdjustDialog({
  isOpen,
  onOpenChange,
  users,
  onAdjust,
}: ReferralsAdjustDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<
    "earned" | "spent" | "admin_adjustment"
  >("admin_adjustment");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedUserId || !adjustAmount || !adjustDescription) {
      toast.error("Please fill in all adjustment fields");
      return;
    }

    setAdjusting(true);
    try {
      await onAdjust(
        selectedUserId,
        Number(adjustAmount),
        adjustType,
        adjustDescription
      );
      toast.success("Credits adjusted successfully!");
      onOpenChange(false);
      
      // Reset form state
      setSelectedUserId("");
      setAdjustAmount("");
      setAdjustDescription("");
      setAdjustType("admin_adjustment");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to adjust credits");
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-bold text-lg">Manually Adjust Credits</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="user" className="font-bold text-xs text-slate-500">Target User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger
                id="user"
                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              >
                <SelectValue placeholder="Select user to adjust" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="type" className="font-bold text-xs text-slate-500">Adjustment Type</Label>
            <Select
              value={adjustType}
              onValueChange={(v: "earned" | "spent" | "admin_adjustment") => setAdjustType(v)}
            >
              <SelectTrigger
                id="type"
                className="bg-white dark:bg-slate-955 border-slate-200 dark:border-slate-800"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                <SelectItem value="earned">
                  Credit / Award Wallet (Earned)
                </SelectItem>
                <SelectItem value="spent">
                  Deduct / Charge Wallet (Spent)
                </SelectItem>
                <SelectItem value="admin_adjustment">
                  Discretionary Correction (Adjustment)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount" className="font-bold text-xs text-slate-500">Amount (₦)</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              placeholder="e.g. 5000"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="desc" className="font-bold text-xs text-slate-500">Reason / Description</Label>
            <Input
              id="desc"
              placeholder="e.g. Compensation for payment gateway delay"
              value={adjustDescription}
              onChange={(e) => setAdjustDescription(e.target.value)}
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={adjusting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            {adjusting ? "Processing..." : "Apply Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
